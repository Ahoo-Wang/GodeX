import { describe, expect, test } from "bun:test";
import {
	BRIDGE_REQUEST_UNSUPPORTED_INPUT_CONTENT,
	BRIDGE_REQUEST_UNSUPPORTED_INPUT_ITEM,
	BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
	BRIDGE_REQUEST_UNSUPPORTED_TOOL,
	BridgeError,
} from "../../error";
import type { ResponseCreateRequest } from "../../protocol/openai/responses";
import { DEEPSEEK_SPEC_CAPABILITIES } from "../../providers/deepseek";
import type { ProviderCapabilities } from "../compatibility";
import { createToolPlanningProfile, type ToolPlanningProfile } from "../tools";
import {
	buildChatCompletionRequest,
	buildChatMessages,
	normalizeCurrentInput,
} from "./request-builder";

const capabilities: ProviderCapabilities = {
	parameters: { supported: new Set(["text.format"]) },
	tools: { supported: new Set(["function"]) },
	toolChoice: { supported: new Set(["auto", "none", "function"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
	},
	reasoning: { effort: "none" },
	streaming: { usage: true },
};

const toolProfile: ToolPlanningProfile = {
	provider: "acme",
	nativeToolTypes: new Set(["function"]),
	degradedToolTypes: new Map([["custom", "function"]]),
	toolChoice: new Set(["auto", "none", "function"]),
	maxTools: 128,
};

function request(
	overrides: Partial<ResponseCreateRequest>,
): ResponseCreateRequest {
	return {
		model: "ignored-envelope-model",
		input: "Return a payload.",
		...overrides,
	};
}

describe("buildChatCompletionRequest", () => {
	test("builds messages and response_format while omitting envelope fields and disabled tools", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				instructions: "You are concise.",
				previous_response_id: "resp_previous",
				tool_choice: "none",
				tools: [
					{
						type: "function",
						name: "lookup",
						parameters: {},
						strict: true,
					},
				],
				text: { format: { type: "json_object" } },
			}),
		});

		expect(result.request).toEqual({
			model: "acme-chat",
			messages: [
				{ role: "system", content: "You are concise." },
				{ role: "user", content: "Return a payload." },
			],
			response_format: { type: "json_object" },
		});
		expect(result.tools.enabled).toBe(false);
		expect("previous_response_id" in result.request).toBe(false);
		expect("tools" in result.request).toBe(false);
		expect("tool_choice" in result.request).toBe(false);
	});

	test("renders tools as Chat Completions function declarations with planned provider tool_choice names", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				tools: [
					{
						type: "custom",
						name: "raw.tool",
						description: "Run raw input.",
						format: { type: "text" },
					},
				],
				tool_choice: { type: "custom", name: "raw.tool" },
			}),
		});

		expect(result.tools.declarations[0]?.providerName).toBe("raw_tool");
		expect(result.request.tools).toEqual([
			{
				type: "function",
				function: expect.objectContaining({
					name: "raw_tool",
					description: expect.stringContaining("Run raw input."),
				}),
			},
		]);
		expect(result.request.tool_choice).toEqual({
			type: "function",
			function: { name: "raw_tool" },
		});
	});

	test("drops non-native tool_search while keeping eager function declarations for DeepSeek", () => {
		const result = buildChatCompletionRequest({
			provider: "deepseek",
			model: "deepseek-v4-pro",
			capabilities: DEEPSEEK_SPEC_CAPABILITIES,
			profile: createToolPlanningProfile({
				provider: "deepseek",
				capabilities: DEEPSEEK_SPEC_CAPABILITIES,
			}),
			request: request({
				tools: [
					{
						type: "function",
						name: "lookup",
						description: "Look up local context.",
						parameters: {
							type: "object",
							properties: {
								query: { type: "string" },
							},
							required: ["query"],
							additionalProperties: false,
						},
						strict: true,
					},
					{ type: "tool_search" },
				],
			}),
		});

		expect(result.request.tools).toEqual([
			{
				type: "function",
				function: {
					name: "lookup",
					description: "Look up local context.",
					parameters: {
						type: "object",
						properties: {
							query: { type: "string" },
						},
						required: ["query"],
						additionalProperties: false,
					},
					strict: true,
				},
			},
		]);
		expect(result.tools.decisions).toContainEqual({
			path: "tools[type=tool_search]",
			action: "ignored",
			reason:
				"deepseek does not support Responses tool 'tool_search'; skipping declaration.",
		});
	});

	test("plans strict degraded json_schema as json_object and inserts schema instruction before user turns", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				instructions: "Use the requested shape.",
				text: {
					format: {
						type: "json_schema",
						name: "payload",
						schema: {
							type: "object",
							required: ["ok"],
							properties: { ok: { type: "boolean" } },
						},
						strict: true,
					},
				},
			}),
		});

		expect(result.output.requiresValidJson).toBe(true);
		expect(result.output.syntheticInstruction).toContain(
			"Return only valid JSON",
		);
		expect(result.request.response_format).toEqual({ type: "json_object" });
		expect(result.request.messages).toEqual([
			{ role: "system", content: "Use the requested shape." },
			{
				role: "system",
				content: expect.stringContaining("Return only valid JSON"),
			},
			{ role: "user", content: "Return a payload." },
		]);
		expect(result.request.messages[1]?.content).toContain('"ok"');
		expect(result.request.messages[1]?.content).not.toContain(
			"conforms to the JSON Schema",
		);
	});

	test("keeps current instructions and schema instruction before replayed history", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				instructions: "Current system rules.",
				input: "Continue.",
				text: {
					format: {
						type: "json_schema",
						name: "payload",
						schema: {
							type: "object",
							required: ["ok"],
							properties: { ok: { type: "boolean" } },
						},
						strict: true,
					},
				},
			}),
			session: {
				previous_response_id: "resp_previous",
				turns: [],
				input_items: [
					{
						type: "message",
						role: "user",
						status: "completed",
						content: [{ type: "input_text", text: "Earlier request." }],
					},
					{
						id: "msg_assistant_previous",
						type: "message",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Earlier answer." }],
					},
				],
			},
		});

		expect(result.request.messages).toEqual([
			{ role: "system", content: "Current system rules." },
			{
				role: "system",
				content: expect.stringContaining("Return only valid JSON"),
			},
			{ role: "user", content: "Earlier request." },
			{ role: "assistant", content: "Earlier answer." },
			{ role: "user", content: "Continue." },
		]);
	});

	test("rejects unsupported response formats instead of forwarding them", () => {
		const error = captureBridgeError(() =>
			buildChatCompletionRequest({
				provider: "acme",
				model: "acme-chat",
				capabilities,
				profile: toolProfile,
				request: request({
					text: { format: { type: "xml" } as never },
				}),
			}),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_PARAMETER);
		expect(error.message).toContain("text.format xml is not supported");
	});

	test("re-encodes replayed assistant tool calls with current provider names", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				tools: [
					{
						type: "function",
						name: "weather.now",
						parameters: {},
						strict: true,
					},
					{
						type: "function",
						name: "weather_now",
						parameters: {},
						strict: true,
					},
				],
			}),
			session: {
				previous_response_id: "resp_previous",
				turns: [],
				input_items: [
					{
						type: "function_call",
						call_id: "call_1",
						name: "weather.now",
						arguments: "{}",
					},
					{
						type: "function_call",
						call_id: "call_2",
						name: "weather_now",
						arguments: "{}",
					},
				],
			},
		});

		expect(
			result.tools.declarations.map((declaration) => declaration.providerName),
		).toEqual(["weather_now", "weather_now_2"]);
		expect(result.request.messages[0]).toEqual(
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						function: expect.objectContaining({ name: "weather_now" }),
					}),
					expect.objectContaining({
						function: expect.objectContaining({ name: "weather_now_2" }),
					}),
				],
			}),
		);
	});

	test("uses local shell output call ids directly", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				input: [
					{
						id: "out_previous",
						type: "local_shell_call_output",
						call_id: "call_previous",
						output: "/repo",
					},
					{ role: "user", content: "Continue." },
				],
			}),
			session: {
				previous_response_id: "resp_previous",
				turns: [],
				input_items: [
					{
						id: "fc_previous",
						type: "local_shell_call",
						call_id: "call_previous",
						action: {
							type: "exec",
							command: ["pwd"],
							env: {},
						},
						status: "completed",
					},
				],
			},
		});

		expect(result.request.messages).toEqual([
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						id: "call_previous",
						function: expect.objectContaining({
							name: "local_shell",
						}),
					}),
				],
			}),
			{ role: "tool", tool_call_id: "call_previous", content: "/repo" },
			{ role: "user", content: "Continue." },
		]);
	});

	test("groups adjacent replayed tool calls before their tool outputs", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({ input: [] }),
			session: {
				previous_response_id: "resp_previous",
				turns: [],
				input_items: [
					{
						type: "function_call",
						call_id: "call_a",
						name: "lookup_a",
						arguments: "{}",
					},
					{
						type: "function_call",
						call_id: "call_b",
						name: "lookup_b",
						arguments: "{}",
					},
					{
						type: "function_call",
						call_id: "call_c",
						name: "lookup_c",
						arguments: "{}",
					},
					{
						type: "function_call_output",
						call_id: "call_a",
						output: "A",
					},
					{
						type: "function_call_output",
						call_id: "call_b",
						output: "B",
					},
					{
						type: "function_call_output",
						call_id: "call_c",
						output: "C",
					},
				],
			},
		});

		expect(result.request.messages).toEqual([
			{
				role: "assistant",
				content: "",
				tool_calls: [
					expect.objectContaining({ id: "call_a" }),
					expect.objectContaining({ id: "call_b" }),
					expect.objectContaining({ id: "call_c" }),
				],
			},
			{ role: "tool", tool_call_id: "call_a", content: "A" },
			{ role: "tool", tool_call_id: "call_b", content: "B" },
			{ role: "tool", tool_call_id: "call_c", content: "C" },
		]);
	});

	test("keeps reasoning content on replayed tool-call assistant messages", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				input: [
					{
						type: "function_call_output",
						call_id: "call_lookup",
						output: "Lookup result.",
					},
				],
				tools: [
					{
						type: "function",
						name: "lookup",
						parameters: {},
						strict: true,
					},
				],
			}),
			session: {
				previous_response_id: "resp_previous",
				turns: [],
				input_items: [
					{
						id: "rs_previous",
						type: "reasoning",
						summary: [],
						content: [{ type: "reasoning_text", text: "Need a lookup." }],
						status: "completed",
					},
					{
						id: "msg_previous",
						type: "message",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "I'll check." }],
					},
					{
						type: "function_call",
						call_id: "call_lookup",
						name: "lookup",
						arguments: "{}",
					},
				],
			},
		});

		expect(result.request.messages).toEqual([
			{
				role: "assistant",
				content: "I'll check.",
				reasoning_content: "Need a lookup.",
				tool_calls: [
					expect.objectContaining({
						id: "call_lookup",
						function: expect.objectContaining({ name: "lookup" }),
					}),
				],
			},
			{
				role: "tool",
				tool_call_id: "call_lookup",
				content: "Lookup result.",
			},
		]);
	});

	test("folds replayed assistant text after tool calls into the tool-call message", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				input: [
					{
						type: "function_call_output",
						call_id: "call_lookup",
						output: "Lookup result.",
					},
				],
				tools: [
					{
						type: "function",
						name: "lookup",
						parameters: {},
						strict: true,
					},
				],
			}),
			session: {
				previous_response_id: "resp_previous",
				turns: [],
				input_items: [
					{
						id: "rs_previous",
						type: "reasoning",
						summary: [],
						content: [{ type: "reasoning_text", text: "Need a lookup." }],
						status: "completed",
					},
					{
						type: "function_call",
						call_id: "call_lookup",
						name: "lookup",
						arguments: "{}",
					},
					{
						id: "msg_previous",
						type: "message",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "I'll check." }],
					},
				],
			},
		});

		expect(result.request.messages).toEqual([
			{
				role: "assistant",
				content: "I'll check.",
				reasoning_content: "Need a lookup.",
				tool_calls: [
					expect.objectContaining({
						id: "call_lookup",
						function: expect.objectContaining({ name: "lookup" }),
					}),
				],
			},
			{
				role: "tool",
				tool_call_id: "call_lookup",
				content: "Lookup result.",
			},
		]);
	});

	test("does not forward ignored Responses envelope fields and records compatibility diagnostics", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			profile: toolProfile,
			request: request({
				metadata: { trace: "yes" },
				conversation: { id: "conv_1" },
				background: true,
			}),
		});

		expect(result.request).toEqual({
			model: "acme-chat",
			messages: [{ role: "user", content: "Return a payload." }],
		});
		expect(result.compatibility.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "metadata",
					action: "ignored",
				}),
				expect.objectContaining({
					path: "conversation",
					action: "ignored",
				}),
				expect.objectContaining({
					path: "background",
					action: "ignored",
				}),
			]),
		);
	});

	test("forwards supported chat options through the provider request", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities: {
				...capabilities,
				parameters: {
					supported: new Set([
						"text.format",
						"stream",
						"temperature",
						"top_p",
						"max_output_tokens",
						"reasoning",
					]),
				},
				reasoning: { effort: "native" },
			},
			profile: toolProfile,
			request: request({
				stream: true,
				temperature: 0.2,
				top_p: 0.8,
				max_output_tokens: 42,
				reasoning: { effort: "medium" },
			}),
		});

		expect(result.request).toMatchObject({
			stream: true,
			stream_options: { include_usage: true },
			temperature: 0.2,
			top_p: 0.8,
			max_tokens: 42,
			reasoning_effort: "medium",
		});
	});

	test("maps boolean reasoning capabilities to provider thinking", () => {
		const enabled = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities: {
				...capabilities,
				parameters: { supported: new Set(["reasoning"]) },
				reasoning: { effort: "boolean" },
			},
			profile: toolProfile,
			request: request({ reasoning: { effort: "medium" } }),
		});
		const disabled = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities: {
				...capabilities,
				parameters: { supported: new Set(["reasoning"]) },
				reasoning: { effort: "boolean" },
			},
			profile: toolProfile,
			request: request({ reasoning: { effort: "none" } }),
		});

		expect(enabled.request).toMatchObject({
			thinking: { type: "enabled" },
		});
		expect(enabled.request).not.toHaveProperty("reasoning_effort");
		expect(disabled.request).toMatchObject({
			thinking: { type: "disabled" },
		});
		expect(disabled.request).not.toHaveProperty("reasoning_effort");
	});

	test("rejects invalid runtime reasoning effort values", () => {
		const error = captureBridgeError(() =>
			buildChatCompletionRequest({
				provider: "acme",
				model: "acme-chat",
				capabilities: {
					...capabilities,
					parameters: { supported: new Set(["reasoning"]) },
					reasoning: { effort: "boolean" },
				},
				profile: toolProfile,
				request: request({
					reasoning: { effort: "extreme" } as never,
				}),
			}),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_PARAMETER);
		expect(error.context).toMatchObject({
			provider: "acme",
			model: "acme-chat",
			parameter: "reasoning.effort",
		});
	});

	test("rejects unhandled provider reasoning capability modes", () => {
		const error = captureBridgeError(() =>
			buildChatCompletionRequest({
				provider: "acme",
				model: "acme-chat",
				capabilities: {
					...capabilities,
					parameters: { supported: new Set(["reasoning"]) },
					reasoning: { effort: "future-mode" as never },
				},
				profile: toolProfile,
				request: request({ reasoning: { effort: "medium" } }),
			}),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_PARAMETER);
		expect(error.context).toMatchObject({
			provider: "acme",
			model: "acme-chat",
			parameter: "reasoning.effort.mode",
			value: "future-mode",
		});
	});

	test("maps Responses safety identifiers to provider user_id", () => {
		const safeIdentifier = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities: {
				...capabilities,
				parameters: {
					supported: new Set(["safety_identifier", "user"]),
				},
			},
			profile: toolProfile,
			request: request({
				safety_identifier: "safe-123",
				user: "legacy-user",
			}),
		});
		const legacyUser = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities: {
				...capabilities,
				parameters: {
					supported: new Set(["user"]),
				},
			},
			profile: toolProfile,
			request: request({ user: "legacy-user" }),
		});

		expect((safeIdentifier.request as { user_id?: string }).user_id).toBe(
			"safe-123",
		);
		expect((legacyUser.request as { user_id?: string }).user_id).toBe(
			"legacy-user",
		);
	});

	test("omits stream usage options when the provider does not support them", () => {
		const result = buildChatCompletionRequest({
			provider: "acme",
			model: "acme-chat",
			capabilities: {
				...capabilities,
				parameters: { supported: new Set(["stream"]) },
				streaming: { usage: false },
			},
			profile: toolProfile,
			request: request({ stream: true }),
		});

		expect(result.request.stream).toBe(true);
		expect(result.request.stream_options).toBeUndefined();
	});

	test("throws when planned provider-native tool declarations cannot be rendered", () => {
		const error = captureBridgeError(() =>
			buildChatCompletionRequest({
				provider: "acme",
				model: "acme-chat",
				capabilities,
				profile: {
					...toolProfile,
					nativeToolTypes: new Set(["custom"]),
					degradedToolTypes: new Map(),
					toolChoice: new Set(["custom"]),
				},
				request: request({
					tools: [
						{
							type: "custom",
							name: "raw_tool",
							description: "Run raw input.",
							format: { type: "text" },
						},
					],
				}),
			}),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_TOOL);
		expect(error.message).toContain(
			"Provider-native tool rendering is not implemented",
		);
	});

	test("throws instead of partially forwarding mixed renderable and non-renderable tools", () => {
		const error = captureBridgeError(() =>
			buildChatCompletionRequest({
				provider: "acme",
				model: "acme-chat",
				capabilities,
				profile: {
					...toolProfile,
					nativeToolTypes: new Set(["function", "custom"]),
					degradedToolTypes: new Map(),
					toolChoice: new Set(["function", "custom"]),
				},
				request: request({
					tools: [
						{
							type: "function",
							name: "lookup",
							parameters: {},
							strict: true,
						},
						{
							type: "custom",
							name: "raw_tool",
							description: "Run raw input.",
							format: { type: "text" },
						},
					],
				}),
			}),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_TOOL);
		expect(error.message).toContain(
			"Provider-native tool rendering is not implemented",
		);
	});

	test("merges consecutive assistant text messages", () => {
		const messages = buildChatMessages([
			{
				role: "assistant",
				content: "Earlier answer.",
				reasoning_content: "First thought.",
			},
			{
				role: "assistant",
				content: "Continue answer.",
				reasoning_content: "Second thought.",
			},
		]);

		expect(messages).toEqual([
			{
				role: "assistant",
				content: "Earlier answer.\nContinue answer.",
				reasoning_content: "First thought.\nSecond thought.",
			},
		]);
	});
});

describe("normalizeCurrentInput", () => {
	test("normalizes simple message arrays and maps developer messages to system messages", () => {
		const normalized = normalizeCurrentInput(
			request({
				instructions: "Global rules.",
				input: [
					{ role: "developer", content: "Use strict tone." },
					{
						role: "user",
						content: [{ type: "input_text", text: "Hello." }],
					},
				],
			}),
		);

		expect(normalized).toEqual([
			{ role: "system", content: "Global rules." },
			{ role: "system", content: "Use strict tone." },
			{ role: "user", content: "Hello." },
		]);
		expect(buildChatMessages(normalized)).toEqual([
			{ role: "system", content: "Global rules." },
			{ role: "system", content: "Use strict tone." },
			{ role: "user", content: "Hello." },
		]);
	});

	test("normalizes reasoning items in current input before assistant messages", () => {
		const normalized = normalizeCurrentInput(
			request({
				input: [
					{
						id: "rs_1",
						type: "reasoning",
						summary: [],
						content: [{ type: "reasoning_text", text: "Earlier thought." }],
						status: "completed",
					},
					{
						id: "msg_1",
						type: "message",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Earlier answer." }],
					},
					{
						role: "user",
						content: [{ type: "input_text", text: "Continue." }],
					},
				],
			}),
		);

		expect(normalized).toHaveLength(2);
		expect(normalized[0]).toMatchObject({
			role: "assistant",
			content: "Earlier answer.",
		});
		expect(normalized[0]?.role).toBe("assistant");
		if (normalized[0]?.role !== "assistant") {
			throw new Error("Expected assistant message.");
		}
		expect(normalized[0].reasoning_content).toBe("Earlier thought.");
		expect(normalized[1]).toEqual({ role: "user", content: "Continue." });
	});

	test("accumulates consecutive reasoning items before assistant messages", () => {
		const normalized = normalizeCurrentInput(
			request({
				input: [
					{
						id: "rs_1",
						type: "reasoning",
						summary: [],
						content: [{ type: "reasoning_text", text: "First thought." }],
						status: "completed",
					},
					{
						id: "rs_2",
						type: "reasoning",
						summary: [],
						content: [{ type: "reasoning_text", text: "Second thought." }],
						status: "completed",
					},
					{
						id: "msg_1",
						type: "message",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Earlier answer." }],
					},
				],
			}),
		);

		expect(normalized).toHaveLength(1);
		expect(normalized[0]?.role).toBe("assistant");
		if (normalized[0]?.role !== "assistant") {
			throw new Error("Expected assistant message.");
		}
		expect(normalized[0].reasoning_content).toBe(
			"First thought.\nSecond thought.",
		);
	});

	test("throws BridgeError for unsupported input content parts", () => {
		const error = captureBridgeError(() =>
			normalizeCurrentInput(
				request({
					input: [
						{
							role: "user",
							content: [
								{
									type: "input_image",
									image_url: "https://example.com/image.png",
								},
							],
						},
					],
				}),
			),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_INPUT_CONTENT);
	});

	test("throws BridgeError for unsupported non-array input content", () => {
		const error = captureBridgeError(() =>
			normalizeCurrentInput(
				request({
					input: [
						{
							role: "user",
							content: { text: "Hello." } as never,
						},
					],
				}),
			),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_INPUT_CONTENT);
		expect(error.message).toContain(
			"Unsupported Responses input content type: object",
		);
	});

	test("throws BridgeError for unsupported input items", () => {
		const error = captureBridgeError(() =>
			normalizeCurrentInput(
				request({
					input: [
						{
							id: "ci_1",
							type: "code_interpreter_call",
							code: "print(1)",
							container_id: "container_1",
							outputs: null,
							status: "completed",
						},
					],
				}),
			),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_INPUT_ITEM);
	});

	test("normalizes assistant output_text content for session replay", () => {
		const normalized = normalizeCurrentInput(
			request({
				input: [
					{
						id: "msg_1",
						type: "message",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Earlier answer." }],
					},
				],
			}),
		);

		expect(normalized).toEqual([
			{ role: "assistant", content: "Earlier answer." },
		]);
	});

	test("normalizes Responses tool history items into provider-neutral chat messages", () => {
		const normalized = normalizeCurrentInput(
			request({
				input: [
					{
						type: "function_call",
						call_id: "call_fn",
						name: "lookup.weather",
						arguments: '{"city":"Hangzhou"}',
					},
					{
						type: "function_call_output",
						call_id: "call_fn",
						output: [{ type: "input_text", text: "Sunny." }],
					},
					{
						type: "shell_call",
						call_id: "call_shell",
						action: { commands: ["bun test"] },
						status: "completed",
					},
					{
						type: "shell_call_output",
						call_id: "call_shell",
						output: [
							{
								outcome: { type: "exit", exit_code: 0 },
								stdout: "ok",
								stderr: "",
							},
							{
								outcome: { type: "timeout" },
								stdout: "",
								stderr: "slow",
							},
						],
					},
					{
						id: "call_local",
						type: "local_shell_call",
						call_id: "call_local",
						action: {
							type: "exec",
							command: ["pwd"],
							env: { CI: "true" },
							timeout_ms: 1000,
							user: "runner",
							working_directory: "/repo",
						},
						status: "completed",
					},
					{
						id: "call_local",
						type: "local_shell_call_output",
						call_id: "call_local",
						output: "/repo",
					},
					{
						type: "apply_patch_call",
						call_id: "call_patch",
						status: "completed",
						operation: { type: "delete_file", path: "tmp.txt" },
					},
					{
						type: "apply_patch_call_output",
						call_id: "call_patch",
						status: "completed",
					},
					{
						type: "custom_tool_call",
						call_id: "call_custom",
						name: "search",
						namespace: "workspace",
						input: "src",
					},
					{
						type: "custom_tool_call_output",
						call_id: "call_custom",
						output: [{ type: "input_text", text: "src/index.ts" }],
					},
				],
			}),
		);

		expect(normalized).toEqual([
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						id: "call_fn",
						function: {
							name: "lookup.weather",
							arguments: '{"city":"Hangzhou"}',
						},
					}),
				],
			}),
			{ role: "tool", tool_call_id: "call_fn", content: "Sunny." },
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						id: "call_shell",
						function: {
							name: "shell",
							arguments: JSON.stringify({ commands: ["bun test"] }),
						},
					}),
				],
			}),
			{
				role: "tool",
				tool_call_id: "call_shell",
				content:
					"[exit 0]\nstdout:\nok\nstderr:\n\n[timeout]\nstdout:\n\nstderr:\nslow",
			},
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						id: "call_local",
						function: {
							name: "local_shell",
							arguments: JSON.stringify({
								command: ["pwd"],
								env: { CI: "true" },
								timeout_ms: 1000,
								user: "runner",
								working_directory: "/repo",
							}),
						},
					}),
				],
			}),
			{ role: "tool", tool_call_id: "call_local", content: "/repo" },
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						id: "call_patch",
						function: {
							name: "apply_patch",
							arguments: JSON.stringify({
								operation: { type: "delete_file", path: "tmp.txt" },
							}),
						},
					}),
				],
			}),
			{ role: "tool", tool_call_id: "call_patch", content: "completed:" },
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						id: "call_custom",
						function: {
							name: "workspace__search",
							arguments: JSON.stringify({ input: "src" }),
						},
					}),
				],
			}),
			{ role: "tool", tool_call_id: "call_custom", content: "src/index.ts" },
		]);
	});

	test("reports provider, model, and message fallback for unsupported input objects", () => {
		const error = captureBridgeError(() =>
			normalizeCurrentInput(
				request({
					model: "fallback-model",
					input: [{ role: "user" } as never],
				}),
				{ provider: "zhipu", model: "glm-5.1" },
			),
		);

		expect(error.code).toBe(BRIDGE_REQUEST_UNSUPPORTED_INPUT_ITEM);
		expect(error.message).toContain(
			"Unsupported Responses input item type for zhipu: message.",
		);
		expect(error.context).toMatchObject({
			provider: "zhipu",
			model: "glm-5.1",
			parameter: "input",
		});
	});
});

function captureBridgeError(action: () => unknown): BridgeError {
	try {
		action();
	} catch (error) {
		if (error instanceof BridgeError) return error;
		throw error;
	}
	throw new Error("Expected BridgeError.");
}
