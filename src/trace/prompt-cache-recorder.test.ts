import { describe, expect, test } from "bun:test";
import { analyzePromptCache } from "./prompt-cache-recorder";
import type { PromptCacheDetection, PromptCacheObservation } from "./types";

function promptCacheDetection(
	overrides: Partial<PromptCacheDetection> = {},
): PromptCacheDetection {
	return {
		risk_level: "none",
		reasons: [],
		prefix_hash: "hash-1",
		prefix_bytes: 10,
		passthrough: {
			prompt_cache_key: true,
			prompt_cache_retention: true,
			cache_control: false,
		},
		...overrides,
	};
}

describe("analyzePromptCache", () => {
	test("does nothing when tracing is disabled", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			request: { model: "gpt-test", input: "hello", stream: false },
			resolved: { provider: "openai", model: "gpt-test" },
			logger: { warn: () => {} },
			app: {
				traceEnabled: false,
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};

		analyzePromptCache(ctx as never, { model: "gpt-test" });

		expect(events).toEqual([]);
	});

	test("records request row when prompt cache analysis fails", () => {
		const events: unknown[] = [];
		const warnings: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			request: { model: "gpt-test", input: "hello", stream: false },
			resolved: { provider: "openai", model: "gpt-test" },
			logger: {
				warn: (event: string, attr: () => Record<string, unknown>) =>
					warnings.push({ event, ...attr() }),
			},
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
				promptCacheRequestAnalyzer: {
					analyze: () => {
						throw new TypeError("bad provider request");
					},
				},
				promptCacheObservationIndex: { get: () => null, remember: () => {} },
				promptCacheDetector: { detect: () => ({}) },
			},
		};

		analyzePromptCache(ctx as never, { model: "gpt-test" });

		expect(events).toEqual([
			expect.objectContaining({
				kind: "request",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "openai",
				model: "gpt-test",
				stream: false,
				payload: { payload: ctx.request },
			}),
		]);
		expect(warnings).toEqual([
			expect.objectContaining({
				event: "trace.prompt_cache_detection.error",
				request_id: "req_1",
			}),
		]);
	});

	test("records request row when prompt cache detection fails", () => {
		const events: unknown[] = [];
		const warnings: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			request: {
				model: "gpt-test",
				input: "hello",
				stream: true,
				prompt_cache_key: "key-1",
			},
			resolved: { provider: "openai", model: "gpt-test" },
			logger: {
				warn: (event: string, attr: () => Record<string, unknown>) =>
					warnings.push({ event, ...attr() }),
			},
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
				promptCacheRequestAnalyzer: {
					analyze: () => ({
						provider: "openai",
						model: "gpt-test",
						requested_prompt_cache_key: "key-1",
						prompt_cache_key: "key-1",
						prefix_parts: [],
						static_prefix_hash: "hash-1",
						static_prefix_bytes: 10,
						dynamic_text_candidates: [],
					}),
				},
				promptCacheObservationIndex: { get: () => null, remember: () => {} },
				promptCacheDetector: {
					detect: () => {
						throw new TypeError("bad detection");
					},
				},
			},
		};

		analyzePromptCache(ctx as never, { model: "gpt-test" });

		expect(events).toEqual([
			expect.objectContaining({
				kind: "request",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "openai",
				model: "gpt-test",
				stream: true,
				requested_prompt_cache_key: "key-1",
				prompt_cache_key: "key-1",
				payload: { payload: ctx.request },
			}),
		]);
		expect(events[0]).not.toHaveProperty("cache_detection");
		expect(warnings).toEqual([
			expect.objectContaining({
				event: "trace.prompt_cache_detection.error",
				request_id: "req_1",
			}),
		]);
	});

	test("remembers prompt cache observations after successful detection", () => {
		const events: unknown[] = [];
		const observations: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			request: {
				model: "gpt-test",
				input: "hello",
				stream: false,
				prompt_cache_key: "key-1",
			},
			resolved: { provider: "openai", model: "gpt-test" },
			logger: { warn: () => {} },
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
				promptCacheRequestAnalyzer: {
					analyze: () => ({
						provider: "openai",
						model: "gpt-test",
						requested_prompt_cache_key: "requested-key",
						prompt_cache_key: "provider-key",
						prefix_parts: [],
						static_prefix_hash: "hash-1",
						static_prefix_bytes: 10,
						dynamic_text_candidates: [],
					}),
				},
				promptCacheObservationIndex: {
					get: (): PromptCacheObservation => ({
						provider: "openai",
						model: "gpt-test",
						cache_identity_key: "requested-key",
						prefix_hash: "old-hash",
						prefix_bytes: 10,
						created_at: 1,
						request_id: "req_previous",
					}),
					remember: (observation: unknown) => observations.push(observation),
				},
				promptCacheDetector: {
					detect: () =>
						promptCacheDetection({
							risk_level: "medium",
							reasons: [
								"prompt_cache_key was not preserved in provider request",
							],
							prefix_hash: "hash-2",
							prefix_bytes: 20,
							tool_fingerprint: { names: ["lookup"], hash: "tools-1" },
							passthrough: {
								prompt_cache_key: false,
								prompt_cache_retention: true,
								cache_control: false,
							},
						}),
				},
			},
		};

		analyzePromptCache(ctx as never, { model: "gpt-test" });

		expect(events).toEqual([
			expect.objectContaining({
				kind: "request",
				requested_prompt_cache_key: "requested-key",
				prompt_cache_key: "provider-key",
				cache_detection: expect.objectContaining({
					risk_level: "medium",
					reasons: ["prompt_cache_key was not preserved in provider request"],
					prefix_hash: "hash-2",
					tool_fingerprint: { names: ["lookup"], hash: "tools-1" },
					passthrough: {
						prompt_cache_key: false,
						prompt_cache_retention: true,
						cache_control: false,
					},
				}),
			}),
		]);
		expect(observations).toEqual([
			expect.objectContaining({
				provider: "openai",
				model: "gpt-test",
				cache_identity_key: "requested-key",
				prefix_hash: "hash-2",
				prefix_bytes: 20,
				tool_fingerprint: { names: ["lookup"], hash: "tools-1" },
				request_id: "req_1",
			}),
		]);
	});

	test("records requested and provider prompt cache retention", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			request: {
				model: "gpt-test",
				input: "hello",
				stream: false,
			},
			resolved: { provider: "openai", model: "gpt-test" },
			logger: { warn: () => {} },
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
				promptCacheRequestAnalyzer: {
					analyze: () => ({
						provider: "openai",
						model: "gpt-test",
						requested_prompt_cache_retention: "24h",
						prompt_cache_retention: "ephemeral",
						prefix_parts: [],
						static_prefix_hash: "hash-1",
						static_prefix_bytes: 10,
						dynamic_text_candidates: [],
					}),
				},
				promptCacheObservationIndex: { get: () => null, remember: () => {} },
				promptCacheDetector: {
					detect: () =>
						promptCacheDetection({
							risk_level: "medium",
							reasons: [
								"prompt_cache_retention was not preserved in provider request",
							],
							passthrough: {
								prompt_cache_key: true,
								prompt_cache_retention: false,
								cache_control: false,
							},
						}),
				},
			},
		};

		analyzePromptCache(ctx as never, { model: "gpt-test" });

		expect(events).toEqual([
			expect.objectContaining({
				kind: "request",
				requested_prompt_cache_retention: "24h",
				prompt_cache_retention: "ephemeral",
				cache_detection: expect.objectContaining({
					risk_level: "medium",
					reasons: [
						"prompt_cache_retention was not preserved in provider request",
					],
					passthrough: {
						prompt_cache_key: true,
						prompt_cache_retention: false,
						cache_control: false,
					},
				}),
			}),
		]);
	});
});
