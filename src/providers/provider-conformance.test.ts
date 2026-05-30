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
import { MINIMAX_PROVIDER_SPEC } from "./minimax/spec";
import { XIAOMI_PROVIDER_SPEC } from "./xiaomi/spec";
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
		for (const provider of ["deepseek", "minimax", "zhipu", "xiaomi"]) {
			expect(
				validateProviderPackageShape(provider, listProviderFiles(provider)),
			).toEqual([]);
		}
	});

	test("built-in provider specs include deepseek, zhipu, minimax, and xiaomi with unique names", () => {
		const names = BUILTIN_PROVIDER_SPECS.map((spec) => spec.name);

		expect(names).toEqual(["deepseek", "zhipu", "minimax", "xiaomi"]);
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

	test("chat-completions provider specs do not expose OpenAI-native tool_search as a callable function", () => {
		for (const spec of BUILTIN_PROVIDER_SPECS) {
			expect(spec.capabilities.tools.supported.has("tool_search")).toBe(false);
			expect(spec.capabilities.tools.degraded?.has("tool_search")).toBe(false);
		}
	});

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

	test("MiniMax provider spec preserves zero usage details", () => {
		expect(
			MINIMAX_PROVIDER_SPEC.response.usage({
				id: "minimax-zero",
				created: 1,
				model: "MiniMax-M2.7",
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
				model: "MiniMax-M2.7",
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
				model: "MiniMax-M2.7",
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
				model: "MiniMax-M2.7",
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
				model: "MiniMax-M2.7",
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
				model: "MiniMax-M2.7",
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
				model: "MiniMax-M2.7",
				choices: [],
				usage: {
					prompt_tokens: 1,
					total_tokens: 1,
				} as never,
			}),
		).toBeNull();
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
