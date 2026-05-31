import { describe, expect, test } from "bun:test";
import { ProviderError } from "../error";
import { DEEPSEEK_PROVIDER_SPEC } from "./deepseek/spec";
import { MINIMAX_PROVIDER_SPEC } from "./minimax/spec";
import { XIAOMI_PROVIDER_SPEC } from "./xiaomi/spec";
import { ZHIPU_PROVIDER_SPEC } from "./zhipu/spec";

describe("ProviderSpec patch hooks", () => {
	test("Zhipu provider patch strips bridge-only native reasoning fields", () => {
		const enabled = ZHIPU_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "glm-5.1",
			messages: [{ role: "user", content: "think" }],
			thinking: { type: "enabled" },
			reasoning_effort: "medium",
		} as never) as Record<string, unknown> | undefined;
		const disabled = ZHIPU_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "glm-5.1",
			messages: [{ role: "user", content: "answer directly" }],
			thinking: { type: "disabled" },
			reasoning_effort: "none",
		} as never) as Record<string, unknown> | undefined;

		expect(enabled).toMatchObject({
			thinking: { type: "enabled" },
		});
		expect(enabled).not.toHaveProperty("reasoning_effort");
		expect(disabled).toMatchObject({
			thinking: { type: "disabled" },
		});
		expect(disabled).not.toHaveProperty("reasoning_effort");
	});

	test("Zhipu provider patch preserves normalized boolean thinking", () => {
		const patched = ZHIPU_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "glm-5.1",
			messages: [{ role: "user", content: "answer directly" }],
			thinking: { type: "disabled" },
			reasoning_effort: "medium",
		} as never) as Record<string, unknown> | undefined;

		expect(patched).toMatchObject({
			thinking: { type: "disabled" },
		});
		expect(patched).not.toHaveProperty("reasoning_effort");
	});

	test("Zhipu provider patch preserves historical reasoning content", () => {
		const explicit = ZHIPU_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "glm-5.1",
			messages: [
				{
					role: "assistant",
					content: "Earlier answer.",
					reasoning_content: "Earlier thought.",
				},
			],
			thinking: { type: "disabled" },
		} as never) as Record<string, unknown> | undefined;
		const inferred = ZHIPU_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "glm-5.1",
			messages: [
				{
					role: "assistant",
					content: "Earlier answer.",
					reasoning_content: "Earlier thought.",
				},
			],
		} as never) as Record<string, unknown> | undefined;

		expect(explicit).toMatchObject({
			thinking: { type: "disabled", clear_thinking: false },
		});
		expect(inferred).toMatchObject({
			thinking: { type: "enabled", clear_thinking: false },
		});
	});

	test("DeepSeek provider patch normalizes native reasoning effort", () => {
		const max = DEEPSEEK_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "deepseek-chat",
			messages: [{ role: "user", content: "think deeply" }],
			reasoning_effort: "xhigh",
		} as never) as Record<string, unknown> | undefined;
		const unsupported = DEEPSEEK_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "deepseek-chat",
			messages: [{ role: "user", content: "think a little" }],
			reasoning_effort: "medium",
		} as never) as Record<string, unknown> | undefined;

		expect(max).toMatchObject({
			thinking: { type: "enabled" },
			reasoning_effort: "max",
		});
		expect(unsupported).toMatchObject({
			thinking: { type: "disabled" },
		});
		expect(unsupported).not.toHaveProperty("reasoning_effort");
	});

	test("DeepSeek provider patch preserves historical reasoning content", () => {
		const patched = DEEPSEEK_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "deepseek-chat",
			messages: [
				{
					role: "assistant",
					content: "Earlier answer.",
					reasoning_content: "Earlier thought.",
				},
			],
		} as never) as Record<string, unknown> | undefined;

		expect(patched).toMatchObject({
			thinking: { type: "enabled" },
		});
		expect(patched).not.toHaveProperty("reasoning_effort");
	});

	test("MiniMax provider patch strips bridge-only reasoning_effort", () => {
		const patched = MINIMAX_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "MiniMax-M2.7",
			messages: [{ role: "user", content: "hello" }],
			reasoning_effort: "medium",
		} as never) as Record<string, unknown> | undefined;

		expect(patched).toMatchObject({
			model: "MiniMax-M2.7",
		});
		expect(patched).not.toHaveProperty("reasoning_effort");
	});

	test("Xiaomi provider patch strips bridge-only reasoning_effort and maps max_tokens", () => {
		const patched = XIAOMI_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "mimo-v2.5-pro",
			messages: [{ role: "user", content: "hello" }],
			reasoning_effort: "medium",
			max_tokens: 1024,
		} as never) as Record<string, unknown> | undefined;

		expect(patched).toMatchObject({
			model: "mimo-v2.5-pro",
			max_completion_tokens: 1024,
		});
		expect(patched).not.toHaveProperty("reasoning_effort");
		expect(patched).not.toHaveProperty("max_tokens");
	});

	test("Xiaomi provider patch enables thinking for historical reasoning content", () => {
		const patched = XIAOMI_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "mimo-v2.5-pro",
			messages: [
				{
					role: "assistant",
					content: "Earlier answer.",
					reasoning_content: "Earlier thought.",
				},
			],
		} as never) as Record<string, unknown> | undefined;

		expect(patched).toMatchObject({
			thinking: { type: "enabled" },
		});
	});

	test("Xiaomi provider patch disables thinking without historical reasoning content", () => {
		const patched = XIAOMI_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "mimo-v2.5-pro",
			messages: [{ role: "user", content: "hello" }],
		} as never) as Record<string, unknown> | undefined;

		expect(patched).toMatchObject({
			thinking: { type: "disabled" },
		});
	});

	test("Xiaomi provider patch preserves bridge-set thinking enabled", () => {
		const patched = XIAOMI_PROVIDER_SPEC.hooks?.patchRequest?.({
			model: "mimo-v2.5-pro",
			messages: [{ role: "user", content: "think" }],
			thinking: { type: "enabled" },
		} as never) as Record<string, unknown> | undefined;

		expect(patched).toMatchObject({
			thinking: { type: "enabled" },
		});
	});

	test("provider patch hooks reject malformed chat completion requests", () => {
		for (const spec of [
			ZHIPU_PROVIDER_SPEC,
			DEEPSEEK_PROVIDER_SPEC,
			MINIMAX_PROVIDER_SPEC,
			XIAOMI_PROVIDER_SPEC,
		]) {
			expect(() =>
				spec.hooks?.patchRequest?.({
					messages: [{ role: "user", content: "missing model" }],
				} as never),
			).toThrow(ProviderError);
			expect(() =>
				spec.hooks?.patchRequest?.({
					model: `${spec.name}-chat`,
					messages: "not messages",
				} as never),
			).toThrow(ProviderError);
		}
	});
});
