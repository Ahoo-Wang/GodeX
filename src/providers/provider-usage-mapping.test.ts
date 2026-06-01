import { describe, expect, test } from "bun:test";
import { ProviderError } from "../error";
import { DEEPSEEK_PROVIDER_SPEC } from "./deepseek/spec";
import { MINIMAX_PROVIDER_SPEC } from "./minimax/spec";
import { XIAOMI_PROVIDER_SPEC } from "./xiaomi/spec";
import { ZHIPU_PROVIDER_SPEC } from "./zhipu/spec";

describe("ProviderSpec usage mapping", () => {
	test("built-in provider specs preserve explicit zero usage details", () => {
		expect(
			ZHIPU_PROVIDER_SPEC.response.usage({
				id: "zhipu-zero",
				created: 1,
				model: "glm-5.1",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					prompt_tokens_details: { cached_tokens: 0 },
				},
			}),
		).toEqual({
			input_tokens: 1,
			output_tokens: 2,
			total_tokens: 3,
			input_tokens_details: { cached_tokens: 0 },
		});
		expect(
			DEEPSEEK_PROVIDER_SPEC.response.usage({
				id: "deepseek-zero",
				created: 1,
				model: "deepseek-v4-flash",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					prompt_cache_hit_tokens: 0,
					completion_tokens_details: { reasoning_tokens: 0 },
				},
			}),
		).toEqual({
			input_tokens: 1,
			output_tokens: 2,
			total_tokens: 3,
			input_tokens_details: { cached_tokens: 0 },
			output_tokens_details: { reasoning_tokens: 0 },
		});
	});

	test("MiniMax provider spec preserves zero usage details", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-zero",
				created: 1,
				model: "MiniMax-M3",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					prompt_tokens_details: { cached_tokens: 0 },
					completion_tokens_details: { reasoning_tokens: 0 },
				},
			}),
		).toEqual({
			input_tokens: 1,
			output_tokens: 2,
			total_tokens: 3,
			input_tokens_details: { cached_tokens: 0 },
			output_tokens_details: { reasoning_tokens: 0 },
		});
	});

	test("Xiaomi provider spec preserves zero usage details", () => {
		expect(
			XIAOMI_PROVIDER_SPEC.response.usage({
				id: "xiaomi-zero",
				created: 1,
				model: "mimo-v2.5-pro",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					prompt_tokens_details: { cached_tokens: 0 },
					completion_tokens_details: { reasoning_tokens: 0 },
				},
			}),
		).toEqual({
			input_tokens: 1,
			output_tokens: 2,
			total_tokens: 3,
			input_tokens_details: { cached_tokens: 0 },
			output_tokens_details: { reasoning_tokens: 0 },
		});
	});

	test("MiniMax provider spec skips partial stream usage without prompt_tokens", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.stream.deltas({
				choices: [],
				usage: {
					total_tokens: 0,
					total_characters: 0,
				} as never,
			}),
		).toEqual([]);
	});

	test("built-in provider specs reject malformed sync usage", () => {
		expect(() =>
			ZHIPU_PROVIDER_SPEC.response.usage({
				id: "zhipu-bad-usage",
				created: 1,
				model: "glm-5.1",
				choices: [],
				usage: {
					prompt_tokens: "1",
					completion_tokens: 2,
					total_tokens: 3,
				},
			} as never),
		).toThrow(ProviderError);
		expect(() =>
			DEEPSEEK_PROVIDER_SPEC.response.usage({
				id: "deepseek-bad-usage",
				created: 1,
				model: "deepseek-v4-flash",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					completion_tokens_details: { reasoning_tokens: "bad" },
				},
			} as never),
		).toThrow(ProviderError);
	});

	test("MiniMax provider spec rejects malformed sync usage", () => {
		expect(() =>
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-bad-usage",
				created: 1,
				model: "MiniMax-M3",
				choices: [],
				usage: {
					prompt_tokens: "1",
					completion_tokens: 2,
					total_tokens: 3,
				},
			} as never),
		).toThrow(ProviderError);
	});

	test("Xiaomi provider spec rejects malformed sync usage", () => {
		expect(() =>
			XIAOMI_PROVIDER_SPEC.response.usage({
				id: "xiaomi-bad-usage",
				created: 1,
				model: "mimo-v2.5-pro",
				choices: [],
				usage: {
					prompt_tokens: "1",
					completion_tokens: 2,
					total_tokens: 3,
				},
			} as never),
		).toThrow(ProviderError);
	});

	test("Xiaomi provider spec rejects malformed reasoning_tokens in usage", () => {
		expect(() =>
			XIAOMI_PROVIDER_SPEC.response.usage({
				id: "xiaomi-bad-reasoning",
				created: 1,
				model: "mimo-v2.5-pro",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					completion_tokens_details: { reasoning_tokens: "bad" },
				},
			} as never),
		).toThrow(ProviderError);
	});

	test("MiniMax provider spec rejects malformed reasoning_tokens in usage", () => {
		expect(() =>
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-bad-reasoning",
				created: 1,
				model: "MiniMax-M3",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					completion_tokens_details: { reasoning_tokens: "bad" },
				},
			} as never),
		).toThrow(ProviderError);
	});

	test("MiniMax provider spec rejects malformed cached_tokens in usage", () => {
		expect(() =>
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-bad-cached",
				created: 1,
				model: "MiniMax-M3",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: 3,
					prompt_tokens_details: { cached_tokens: "bad" },
				},
			} as never),
		).toThrow(ProviderError);
	});

	test("MiniMax provider spec rejects malformed total_tokens in usage", () => {
		expect(() =>
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-bad-total",
				created: 1,
				model: "MiniMax-M3",
				choices: [],
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					total_tokens: NaN,
				},
			} as never),
		).toThrow(ProviderError);
	});

	test("MiniMax provider spec returns null for null usage", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-null-usage",
				created: 1,
				model: "MiniMax-M3",
				choices: [],
				usage: null as never,
			}),
		).toBeNull();
	});

	test("Xiaomi provider spec returns null for null usage", () => {
		expect(
			XIAOMI_PROVIDER_SPEC.response.usage({
				id: "xiaomi-null-usage",
				created: 1,
				model: "mimo-v2.5-pro",
				choices: [],
				usage: null as never,
			}),
		).toBeNull();
	});

	test("MiniMax provider spec returns null for partial usage without completion_tokens", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-partial-usage",
				created: 1,
				model: "MiniMax-M3",
				choices: [],
				usage: {
					prompt_tokens: 1,
					total_tokens: 1,
				} as never,
			}),
		).toBeNull();
	});
});
