import { describe, expect, test } from "bun:test";
import { traceUsageFromResponseUsage } from "./usage";

describe("traceUsageFromResponseUsage", () => {
	test("extracts OpenAI-style cached tokens", () => {
		const usage = traceUsageFromResponseUsage({
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			input_tokens_details: { cached_tokens: 40 },
		});
		expect(usage).toEqual({
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			cached_tokens: 40,
			cache_hit_ratio: 0.4,
		});
	});

	test("returns null for missing response usage", () => {
		expect(traceUsageFromResponseUsage(null)).toBeNull();
		expect(traceUsageFromResponseUsage(undefined)).toBeNull();
	});
});
