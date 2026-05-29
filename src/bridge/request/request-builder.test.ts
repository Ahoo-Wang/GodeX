import { describe, expect, test } from "bun:test";
import {
	BRIDGE_REQUEST_UNSUPPORTED_INPUT_CONTENT,
	BRIDGE_REQUEST_UNSUPPORTED_INPUT_ITEM,
	BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
	BRIDGE_REQUEST_UNSUPPORTED_TOOL,
	BridgeError,
} from "../../error";
import type { ResponseCreateRequest } from "../../protocol/openai/responses";
import type { ProviderCapabilities } from "../compatibility";
import type { ToolPlanningProfile } from "../tools";
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
		degraded: new Map([["json_schema", "json_object"]]),
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

	test("plans strict degraded json_schema as json_object and appends schema instruction", () => {
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
			{ role: "user", content: "Return a payload." },
			{
				role: "system",
				content: expect.stringContaining("Return only valid JSON"),
			},
		]);
		expect(result.request.messages[2]?.content).toContain('"ok"');
		expect(result.request.messages[2]?.content).not.toContain(
			"conforms to the JSON Schema",
		);
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
		expect(result.request.messages.slice(0, 2)).toEqual([
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						function: expect.objectContaining({ name: "weather_now" }),
					}),
				],
			}),
			expect.objectContaining({
				role: "assistant",
				tool_calls: [
					expect.objectContaining({
						function: expect.objectContaining({ name: "weather_now_2" }),
					}),
				],
			}),
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
