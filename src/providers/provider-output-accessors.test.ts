import { describe, expect, test } from "bun:test";
import { DEEPSEEK_PROVIDER_SPEC } from "./deepseek/spec";
import { MINIMAX_PROVIDER_SPEC } from "./minimax/spec";
import { XIAOMI_PROVIDER_SPEC } from "./xiaomi/spec";
import { ZHIPU_PROVIDER_SPEC } from "./zhipu/spec";

describe("ProviderSpec output accessors", () => {
	test("deepseek provider spec extracts text from defensive array content", () => {
		expect(
			DEEPSEEK_PROVIDER_SPEC.response.outputText({
				id: "deepseek-array-content",
				created: 1,
				model: "deepseek-v4-flash",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: {
							role: "assistant",
							content: [
								{ type: "text", text: "hello" },
								{ type: "image_url", image_url: { url: "ignored" } },
								{ type: "text", text: " world" },
							],
						},
					},
				],
			} as never),
		).toBe("hello world");
	});

	test("MiniMax provider spec extracts text from defensive array content", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.response.outputText({
				id: "minimax-array-content",
				created: 1,
				model: "MiniMax-M2.7",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: {
							role: "assistant",
							content: [
								{ type: "text", text: "hello" },
								{ type: "image_url", image_url: { url: "ignored" } },
								{ type: "text", text: " world" },
							],
						},
					},
				],
			} as never),
		).toBe("hello world");
	});

	test("Xiaomi provider spec extracts text from defensive array content", () => {
		expect(
			XIAOMI_PROVIDER_SPEC.response.outputText({
				id: "xiaomi-array-content",
				created: 1,
				model: "mimo-v2.5-pro",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: {
							role: "assistant",
							content: [
								{ type: "text", text: "hello" },
								{ type: "image_url", image_url: { url: "ignored" } },
								{ type: "text", text: " world" },
							],
						},
					},
				],
			} as never),
		).toBe("hello world");
	});

	test("DeepSeek provider spec extracts sync reasoning content", () => {
		expect(
			DEEPSEEK_PROVIDER_SPEC.response.reasoningText?.({
				id: "deepseek-reasoning",
				created: 1,
				model: "deepseek-v4-flash",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: {
							role: "assistant",
							content: "answer",
							reasoning_content: "thinking",
						},
					},
				],
			} as never),
		).toBe("thinking");
	});

	test("Zhipu provider spec extracts sync reasoning content", () => {
		expect(
			ZHIPU_PROVIDER_SPEC.response.reasoningText?.({
				id: "zhipu-reasoning",
				created: 1,
				model: "glm-5.1",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: {
							role: "assistant",
							content: "answer",
							reasoning_content: "thinking",
						},
					},
				],
			} as never),
		).toBe("thinking");
	});

	test("MiniMax provider spec extracts sync reasoning details", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.response.reasoningText?.({
				id: "minimax-reasoning",
				created: 1,
				model: "MiniMax-M2.7",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: {
							role: "assistant",
							content: "answer",
							reasoning_details: [{ text: "think " }, { text: "more" }],
						},
					},
				],
			}),
		).toBe("think more");
	});

	test("Xiaomi provider spec extracts sync reasoning content", () => {
		expect(
			XIAOMI_PROVIDER_SPEC.response.reasoningText?.({
				id: "xiaomi-reasoning",
				created: 1,
				model: "mimo-v2.5-pro",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: {
							role: "assistant",
							content: "answer",
							reasoning_content: "thinking",
						},
					},
				],
			}),
		).toBe("thinking");
	});

	test("MiniMax provider spec returns empty string for null content", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.response.outputText({
				id: "minimax-null-content",
				created: 1,
				model: "MiniMax-M2.7",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: { role: "assistant", content: null },
					},
				],
			}),
		).toBe("");
	});

	test("Xiaomi provider spec returns empty string for null content", () => {
		expect(
			XIAOMI_PROVIDER_SPEC.response.outputText({
				id: "xiaomi-null-content",
				created: 1,
				model: "mimo-v2.5-pro",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: { role: "assistant", content: null },
					},
				],
			}),
		).toBe("");
	});
});
