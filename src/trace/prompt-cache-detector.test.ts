import { describe, expect, test } from "bun:test";
import { PrefixPromptCacheDetector } from "./prompt-cache-detector";
import type { PromptCacheAnalysisInput } from "./types";

function analysis(
	overrides: Partial<PromptCacheAnalysisInput>,
): PromptCacheAnalysisInput {
	return {
		provider: "openai",
		model: "gpt-test",
		prefix_parts: [],
		static_prefix_hash: "hash-1",
		static_prefix_bytes: 10,
		dynamic_text_candidates: [],
		...overrides,
	};
}

describe("PrefixPromptCacheDetector", () => {
	test("flags same cache identity with changed prefix as high risk", () => {
		const detector = new PrefixPromptCacheDetector();
		const result = detector.detect({
			current: analysis({
				requested_prompt_cache_key: "key-1",
				prompt_cache_key: "key-1",
				static_prefix_hash: "hash-2",
			}),
			previous: {
				provider: "openai",
				model: "gpt-test",
				cache_identity_key: "key-1",
				prefix_hash: "hash-1",
				prefix_bytes: 10,
				created_at: 1,
				request_id: "req_1",
			},
		});
		expect(result.risk_level).toBe("high");
		expect(result.reasons).toContain("prompt_cache_key prefix changed");
	});

	test("flags missing provider-side passthrough", () => {
		const detector = new PrefixPromptCacheDetector();
		const result = detector.detect({
			current: analysis({
				requested_prompt_cache_key: "key-1",
				requested_prompt_cache_retention: "24h",
			}),
		});
		expect(result.risk_level).toBe("medium");
		expect(result.passthrough.prompt_cache_key).toBe(false);
		expect(result.passthrough.prompt_cache_retention).toBe(false);
	});

	test("detects dynamic text candidates", () => {
		const detector = new PrefixPromptCacheDetector();
		const result = detector.detect({
			current: analysis({
				dynamic_text_candidates: [
					{ source: "instructions", text: "request id req_123456" },
				],
			}),
		});
		expect(result.risk_level).toBe("medium");
		expect(result.reasons).toContain("dynamic prompt prefix content detected");
	});

	test("does not mark missing cache key as risk by itself", () => {
		const detector = new PrefixPromptCacheDetector();
		const result = detector.detect({ current: analysis({}) });
		expect(result.risk_level).toBe("none");
		expect(result.prefix_hash).toBe("hash-1");
	});

	test("does not flag tool fingerprint without previous observation", () => {
		const detector = new PrefixPromptCacheDetector();
		const result = detector.detect({
			current: analysis({
				requested_prompt_cache_key: "key-1",
				prompt_cache_key: "key-1",
				tool_fingerprint: { names: ["search"], hash: "tools-1" },
			}),
		});
		expect(result.risk_level).toBe("none");
		expect(result.reasons).not.toContain(
			"tool order or names changed for cache identity",
		);
	});

	test("flags mismatched passthrough value as risk", () => {
		const detector = new PrefixPromptCacheDetector();
		const result = detector.detect({
			current: analysis({
				requested_prompt_cache_key: "key-a",
				prompt_cache_key: "key-b",
			}),
		});
		expect(result.risk_level).toBe("medium");
		expect(result.passthrough.prompt_cache_key).toBe(false);
		expect(result.reasons).toContain(
			"prompt_cache_key was not preserved in provider request",
		);
	});
});
