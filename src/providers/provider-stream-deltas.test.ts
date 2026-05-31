import { describe, expect, test } from "bun:test";
import { DEEPSEEK_PROVIDER_SPEC } from "./deepseek/spec";
import { MINIMAX_PROVIDER_SPEC } from "./minimax/spec";
import { XIAOMI_PROVIDER_SPEC } from "./xiaomi/spec";
import { ZHIPU_PROVIDER_SPEC } from "./zhipu/spec";

describe("ProviderSpec stream deltas", () => {
	test("built-in provider spec stream deltas omit undefined fields", () => {
		const cases = [
			ZHIPU_PROVIDER_SPEC.stream.deltas({
				id: "zhipu-stream",
				created: 1,
				model: "glm-5.1",
				choices: [{ index: 0, delta: { content: "hello" } }],
				usage: {
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
				},
			}),
			DEEPSEEK_PROVIDER_SPEC.stream.deltas({
				choices: [
					{
						index: 0,
						delta: { reasoning_content: "think" },
						finish_reason: "stop",
					},
				],
			}),
			MINIMAX_PROVIDER_SPEC.stream.deltas({
				choices: [
					{
						index: 0,
						delta: { content: "hello" },
						finish_reason: "stop",
					},
				],
			}),
			XIAOMI_PROVIDER_SPEC.stream.deltas({
				choices: [
					{
						index: 0,
						delta: { content: "hello" },
						finish_reason: "stop",
					},
				],
			}),
		];

		for (const deltas of cases) {
			expect(deltas?.length).toBeGreaterThan(0);
			for (const delta of deltas ?? []) {
				expect(Object.values(delta as Record<string, unknown>)).not.toContain(
					undefined,
				);
			}
		}
	});

	test("built-in provider spec stream deltas omit empty tool calls", () => {
		expect(
			ZHIPU_PROVIDER_SPEC.stream.deltas({
				id: "zhipu-empty-tool",
				created: 1,
				model: "glm-5.1",
				choices: [{ index: 0, delta: { tool_calls: [{}] } }],
			}),
		).toEqual([]);
		expect(
			DEEPSEEK_PROVIDER_SPEC.stream.deltas({
				choices: [{ index: 0, delta: { tool_calls: [{}] } }],
			}),
		).toEqual([]);
		expect(
			MINIMAX_PROVIDER_SPEC.stream.deltas({
				choices: [{ index: 0, delta: { tool_calls: [{}] } }],
			}),
		).toEqual([]);
		expect(
			XIAOMI_PROVIDER_SPEC.stream.deltas({
				choices: [{ index: 0, delta: { tool_calls: [{}] } }],
			}),
		).toEqual([]);
	});

	test("built-in provider spec stream deltas put usage before finish in the same chunk", () => {
		expect(
			ZHIPU_PROVIDER_SPEC.stream
				.deltas({
					id: "zhipu-usage-finish",
					created: 1,
					model: "glm-5.1",
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 2,
						total_tokens: 3,
					},
				})
				.map((delta) => Object.keys(delta as Record<string, unknown>)[0]),
		).toEqual(["usage", "finishReason"]);
		expect(
			DEEPSEEK_PROVIDER_SPEC.stream
				.deltas({
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 2,
						total_tokens: 3,
					},
				})
				.map((delta) => Object.keys(delta as Record<string, unknown>)[0]),
		).toEqual(["usage", "finishReason"]);
		expect(
			MINIMAX_PROVIDER_SPEC.stream
				.deltas({
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 2,
						total_tokens: 3,
					},
				})
				.map((delta) => Object.keys(delta as Record<string, unknown>)[0]),
		).toEqual(["usage", "finishReason"]);
		expect(
			XIAOMI_PROVIDER_SPEC.stream
				.deltas({
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 2,
						total_tokens: 3,
					},
				})
				.map((delta) => Object.keys(delta as Record<string, unknown>)[0]),
		).toEqual(["usage", "finishReason"]);
	});
});
