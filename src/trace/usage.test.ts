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

	test("extracts Anthropic-style raw usage fields", () => {
		const usage = traceUsageFromResponseUsage(
			{
				input_tokens: 100,
				output_tokens: 20,
				total_tokens: 120,
			},
			{
				cache_creation_input_tokens: 12,
				cache_read_input_tokens: 34,
			},
		);
		expect(usage).not.toBeNull();
		expect(usage?.cache_creation_input_tokens).toBe(12);
		expect(usage?.cache_read_input_tokens).toBe(34);
	});

	test("returns null for missing response usage", () => {
		expect(traceUsageFromResponseUsage(null)).toBeNull();
		expect(traceUsageFromResponseUsage(undefined)).toBeNull();
	});
});
