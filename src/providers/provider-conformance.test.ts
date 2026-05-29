import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	validateProviderPackageShape,
} from "../bridge/provider-spec";
import { DEFAULT_TOOL_NAME_CODEC } from "../bridge/tools";
import { ProviderError } from "../error";
import { BUILTIN_PROVIDER_SPECS } from "./builtin";
import { DEEPSEEK_PROVIDER_SPEC } from "./deepseek/spec";
import { ZHIPU_PROVIDER_SPEC } from "./zhipu/spec";

function listProviderFiles(provider: string): string[] {
	const root = join(import.meta.dir, provider);
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const abs = join(dir, entry.name);
			if (entry.isDirectory()) walk(abs);
			else out.push(abs.slice(process.cwd().length + 1));
		}
	};
	walk(root);
	return out;
}

describe("ProviderSpec runtime conformance", () => {
	test("built-in providers use ProviderSpec package shape", () => {
		for (const provider of ["example", "deepseek", "zhipu"]) {
			expect(
				validateProviderPackageShape(provider, listProviderFiles(provider)),
			).toEqual([]);
		}
	});

	test("built-in provider specs include example, deepseek, and zhipu with unique names", () => {
		const names = BUILTIN_PROVIDER_SPECS.map((spec) => spec.name);

		expect(names).toEqual(["example", "deepseek", "zhipu"]);
		expect(new Set(names).size).toBe(names.length);
	});

	for (const spec of BUILTIN_PROVIDER_SPECS) {
		test(`${spec.name} spec exposes protocol, capabilities, accessors, and toolName`, () => {
			expect(spec.protocol).toBe(CHAT_COMPLETIONS_PROTOCOL);
			expect(spec.capabilities.parameters.supported.size).toBeGreaterThan(0);
			expect(spec.capabilities.responseFormats.supported.size).toBeGreaterThan(
				0,
			);
			expect(spec.endpoint.defaultBaseURL).toStartWith("https://");
			expect(spec.auth).toBe(BEARER_AUTH);
			expect(spec.toolName.toProviderName("local.shell")).toBeString();
			expect(spec.toolName.fromProviderName("provider_name")).toBe(
				"provider_name",
			);
			expect(spec.response.firstChoice).toBeFunction();
			expect(spec.response.finishReason).toBeFunction();
			expect(spec.response.outputText).toBeFunction();
			expect(spec.response.usage).toBeFunction();
			expect(spec.stream.deltas).toBeFunction();
		});
	}

	test("Zhipu and DeepSeek share the same chat-completions function name codec constraints", () => {
		expect(ZHIPU_PROVIDER_SPEC.toolName).toBe(DEFAULT_TOOL_NAME_CODEC);
		expect(ZHIPU_PROVIDER_SPEC.toolName).toBe(DEEPSEEK_PROVIDER_SPEC.toolName);
		for (const spec of [ZHIPU_PROVIDER_SPEC, DEEPSEEK_PROVIDER_SPEC]) {
			expect(spec.toolName.toProviderName("abc-XYZ_09")).toBe("abc-XYZ_09");
			expect(spec.toolName.toProviderName("")).toBe("tool");
			expect(spec.toolName.toProviderName("x".repeat(65))).toBe("x".repeat(64));
			expect(spec.toolName.toProviderName("weather.now")).toBe("weather_now");
			expect(spec.toolName.toProviderName("weather.now")).toMatch(
				/^[a-zA-Z0-9_-]{1,64}$/,
			);
		}
	});

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

	test("provider patch hooks reject malformed chat completion requests", () => {
		for (const spec of [ZHIPU_PROVIDER_SPEC, DEEPSEEK_PROVIDER_SPEC]) {
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
	});
});
