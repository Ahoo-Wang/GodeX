import { describe, expect, test } from "bun:test";
import { analyzePromptCache, recordTraceUsage } from "./integration";

describe("recordTraceUsage", () => {
	test("records cached token usage", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			resolved: { provider: "openai", model: "gpt-test" },
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};
		recordTraceUsage(ctx as never, {
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			input_tokens_details: { cached_tokens: 40 },
		});
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: "usage",
			usage: { cached_tokens: 40, cache_hit_ratio: 0.4 },
		});
	});
});

describe("analyzePromptCache", () => {
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
});
