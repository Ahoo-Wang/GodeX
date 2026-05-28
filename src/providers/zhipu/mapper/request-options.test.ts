// src/providers/zhipu/request.test.ts
import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../../adapter/compatibility";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { AdapterError } from "../../../error";
import { createLogger, type Logger } from "../../../logger";
import type { ResponseCreateRequest } from "../../../protocol/openai/responses";
import {
	describeCurrentInputContentCompatibility,
	describeUnsupportedToolCompatibility,
} from "../../shared/compatibility-test-suite";
import type { ChatCompletionTextRequest } from "../protocol/completions";
import { createZhipuMapper } from "./index";

function ctx(
	partial: Partial<ResponseCreateRequest> = {},
	session?: ResponsesContext["session"],
	logger: Logger = createLogger({ level: "error" }),
): ResponsesContext {
	const diagnostics: CompatibilityDiagnostic[] = [];
	return {
		request: { model: "glm-5.1", ...partial } as ResponseCreateRequest,
		resolved: { provider: "zhipu", model: "glm-5.1" },
		session: session ?? null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger,
		app: {} as unknown as ApplicationContext,
		provider: {
			name: "zhipu",
			mapper: {} as never,
			client: {} as never,
		},
		diagnostics,
		addDiagnostic(d: CompatibilityDiagnostic) {
			diagnostics.push(d);
		},
	} as unknown as ResponsesContext;
}

const requestMapper = createZhipuMapper().request;
const mapRequest = (c: ResponsesContext): ChatCompletionTextRequest =>
	requestMapper.map(c) as ChatCompletionTextRequest;
const mapCompatibilityRequest = (partial: Partial<ResponseCreateRequest>) => {
	const c = ctx(partial);
	return { request: mapRequest(c), diagnostics: c.diagnostics };
};

describeCurrentInputContentCompatibility<ChatCompletionTextRequest>({
	provider: "Zhipu",
	mapRequest: mapCompatibilityRequest,
	getUserMessageContent(request) {
		return request.messages.find((message) => message.role === "user")?.content;
	},
});

describeUnsupportedToolCompatibility<ChatCompletionTextRequest>({
	provider: "Zhipu",
	mapRequest: mapCompatibilityRequest,
	unsupportedTool: {
		type: "code_interpreter",
		container: { type: "auto" },
	},
	expectNoProviderTools(request) {
		expect(request.tools).toBeUndefined();
	},
});

describe("buildZhipuRequest", () => {
	test("converts string input to user message", () => {
		const result = mapRequest(
			ctx({ input: "Hello", instructions: "Be helpful." }),
		);
		expect(result.model).toBe("glm-5.1");
		expect(result.messages[0]).toEqual({
			role: "system",
			content: "Be helpful.",
		});
		expect(result.messages[1]).toEqual({ role: "user", content: "Hello" });
		expect(result.stream).toBeUndefined();
	});

	test("converts array input items to messages", () => {
		const result = mapRequest(
			ctx({
				input: [
					{ role: "user", content: "Hi" },
					{ role: "assistant", content: "Hello!" },
					{ role: "user", content: "How are you?" },
				],
			}),
		);
		expect(result.messages).toEqual([
			{ role: "user", content: "Hi" },
			{ role: "assistant", content: "Hello!" },
			{ role: "user", content: "How are you?" },
		]);
	});

	test("prepends session history before current input", () => {
		const sessionCtx = ctx(
			{
				input: "Follow-up",
				previous_response_id: "resp_prev",
			},
			{
				previous_response_id: "resp_prev",
				turns: [],
				input_items: [
					{
						type: "message",
						role: "user",
						content: [{ type: "input_text", text: "First" }],
					},
					{
						type: "message",
						role: "assistant",
						status: "completed",
						id: "msg_1",
						content: [{ type: "output_text", text: "Reply" }],
					},
				],
			},
		);
		const result = mapRequest(sessionCtx);
		expect(result.messages[0]).toEqual({ role: "user", content: "First" });
		expect(result.messages[1]).toEqual({ role: "assistant", content: "Reply" });
		expect(result.messages[2]).toEqual({ role: "user", content: "Follow-up" });
	});

	test("preserves tool call IDs for function call outputs", () => {
		const result = mapRequest(
			ctx({
				input: [
					{
						type: "function_call_output",
						call_id: "call_weather",
						output: '{"temperature":21}',
					},
				],
			}),
		);

		expect(result.messages[0]).toEqual({
			role: "tool",
			content: '{"temperature":21}',
			tool_call_id: "call_weather",
		});
	});

	test("converts text content arrays in function call outputs", () => {
		const result = mapRequest(
			ctx({
				input: [
					{
						type: "function_call_output",
						call_id: "call_weather",
						output: [{ type: "input_text", text: '{"temperature":21}' }],
					},
				],
			}),
		);

		expect(result.messages[0]).toEqual({
			role: "tool",
			content: '{"temperature":21}',
			tool_call_id: "call_weather",
		});
	});

	test("maps prior function_call items to assistant tool_calls", () => {
		const sessionCtx = ctx(
			{ input: "Use the tool result." },
			{
				previous_response_id: "resp_prev",
				turns: [],
				input_items: [
					{
						type: "function_call",
						call_id: "call_weather",
						name: "get_weather",
						arguments: '{"city":"Beijing"}',
					},
					{
						type: "function_call_output",
						call_id: "call_weather",
						output: '{"temperature":21}',
					},
				],
			},
		);

		const result = mapRequest(sessionCtx);

		expect(result.messages[0]).toEqual({
			role: "assistant",
			content: "",
			tool_calls: [
				{
					id: "call_weather",
					type: "function",
					function: {
						name: "get_weather",
						arguments: '{"city":"Beijing"}',
					},
				},
			],
		});
		expect(result.messages[1]).toEqual({
			role: "tool",
			content: '{"temperature":21}',
			tool_call_id: "call_weather",
		});
		expect(result.messages[2]).toEqual({
			role: "user",
			content: "Use the tool result.",
		});
	});

	test("maps reasoning to thinking config", () => {
		const result = mapRequest(
			ctx({
				reasoning: { effort: "high" },
			}),
		);
		expect(result.thinking).toEqual({ type: "enabled" });
	});

	test("clamps temperature to 1.0 max", () => {
		const result = mapRequest(ctx({ temperature: 1.5 }));
		expect(result.temperature).toBe(1.0);
	});

	test("clamps temperature to 0.0 min", () => {
		const result = mapRequest(ctx({ temperature: -0.3 }));
		expect(result.temperature).toBe(0);
	});

	test("maps max_output_tokens to max_tokens", () => {
		const result = mapRequest(ctx({ max_output_tokens: 4096 }));
		expect(result.max_tokens).toBe(4096);
	});

	test("maps safety identifiers to Zhipu user_id", () => {
		const safetyResult = mapRequest(ctx({ safety_identifier: "codex-user-1" }));
		expect(safetyResult.user_id).toBe("codex-user-1");

		const deprecatedUserResult = mapRequest(ctx({ user: "legacy-user" }));
		expect(deprecatedUserResult.user_id).toBe("legacy-user");
	});

	test("sets stream: true when requested", () => {
		const result = mapRequest(ctx({ stream: true }));
		expect(result.stream).toBe(true);
	});

	test("warns and ignores unsupported hard Responses request options", () => {
		const testCtx = ctx({
			input: "Hi",
			background: true,
			conversation: { id: "conv_1" },
			prompt: { id: "pmpt_1" },
		});

		const result = mapRequest(testCtx);

		expect(result.messages).toEqual([{ role: "user", content: "Hi" }]);
		expect(testCtx.diagnostics.map((d) => d.path)).toEqual(
			expect.arrayContaining(["background", "conversation", "prompt"]),
		);
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				path: "conversation",
				message: expect.stringContaining("previous_response_id"),
				metadata: expect.objectContaining({
					provider: "zhipu",
					model: "glm-5.1",
					parameter: "conversation",
					value: { type: "object", keys: ["id"], id: "conv_1" },
				}),
			}),
		);
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				path: "prompt",
				message: expect.stringContaining("resolved before reaching"),
				metadata: expect.objectContaining({
					parameter: "prompt",
					value: { type: "object", keys: ["id"], id: "pmpt_1" },
				}),
			}),
		);
	});

	test("downgrades truncation auto instead of rejecting the request", () => {
		const testCtx = ctx({ input: "Hi", truncation: "auto" });

		const result = mapRequest(testCtx);

		expect(result.messages).toEqual([{ role: "user", content: "Hi" }]);
		expect("truncation" in result).toBe(false);
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "truncation",
				action: "ignored",
				message: expect.stringContaining("forwarding without truncation"),
				metadata: expect.objectContaining({
					parameter: "truncation",
					value: "auto",
				}),
			}),
		);
	});

	test("does not map parallel_tool_calls to Zhipu tool_stream", () => {
		const testCtx = ctx({ input: "Hi", parallel_tool_calls: true });

		const result = mapRequest(testCtx);

		expect("tool_stream" in result).toBe(false);
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "parallel_tool_calls",
				action: "ignored",
				message: expect.stringContaining("parallel tool-call control"),
				metadata: expect.objectContaining({
					parameter: "parallel_tool_calls",
					value: true,
				}),
			}),
		);
	});

	test("accepts optional OpenAI fields that are echoed but not sent to Zhipu", () => {
		const result = mapRequest(
			ctx({
				input: "Hi",
				include: ["message.output_text.logprobs"],
				max_tool_calls: 1,
				stream_options: { include_obfuscation: true },
				top_logprobs: 2,
				reasoning: { effort: "medium", summary: "auto" },
				text: { verbosity: "low" },
			}),
		);

		expect(result.messages).toEqual([{ role: "user", content: "Hi" }]);
		expect(result.thinking).toEqual({ type: "enabled" });
		expect("include" in result).toBe(false);
		expect("max_tool_calls" in result).toBe(false);
		expect("top_logprobs" in result).toBe(false);
	});

	test("degrades json_schema to json_object with diagnostic and schema constraint message", () => {
		const c = ctx({
			text: {
				format: {
					type: "json_schema",
					name: "person",
					description: "A person payload.",
					schema: {
						type: "object",
						properties: { name: { type: "string" } },
						required: ["name"],
					},
				},
			},
		});
		const result = mapRequest(c);

		expect(result.response_format).toEqual({ type: "json_object" });
		expect(c.diagnostics).toContainEqual(
			expect.objectContaining({
				path: "text.format",
				action: "degraded",
			}),
		);
		const schemaMessage = result.messages.at(-1);
		expect(schemaMessage?.role).toBe("user");
		expect(schemaMessage?.content).toEqual(
			expect.stringContaining(
				"Return only JSON that conforms to the JSON Schema below.",
			),
		);
		expect(schemaMessage?.content).toEqual(
			expect.stringContaining("Schema name: person"),
		);
		expect(schemaMessage?.content).toEqual(
			expect.stringContaining("Schema description: A person payload."),
		);
		expect(schemaMessage?.content).toEqual(
			expect.stringContaining('"required":["name"]'),
		);
	});

	test("maps response_format json_object to response_format json_object", () => {
		const result = mapRequest(
			ctx({
				text: { format: { type: "json_object" } },
			}),
		);
		expect(result.response_format).toEqual({ type: "json_object" });
	});

	test('treats tool_choice "none" as an explicit no-tools downgrade', () => {
		const result = mapRequest(
			ctx({
				tools: [
					{
						type: "function",
						name: "get_weather",
						parameters: { type: "object" },
						strict: true,
					},
				],
				tool_choice: "none",
			}),
		);

		expect(result.tools).toBeUndefined();
		expect(result.tool_choice).toBeUndefined();
	});

	test("warns when downgrading unsupported tool_choice to auto", () => {
		const testCtx = ctx({
			tools: [
				{
					type: "function",
					name: "get_weather",
					parameters: { type: "object" },
					strict: true,
				},
			],
			tool_choice: "required",
		});

		const result = mapRequest(testCtx);

		expect(result.tool_choice).toBe("auto");
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "tool_choice",
				action: "degraded",
			}),
		);
	});

	test("rejects requests whose mapped tools exceed provider tool capacity", () => {
		const tools = Array.from({ length: 129 }, (_, i) => ({
			type: "function" as const,
			name: `tool_${i}`,
			parameters: { type: "object" as const },
			strict: true,
		}));
		const requestCtx = ctx({
			input: "Hi",
			tools,
		});

		let thrown: unknown;
		try {
			mapRequest(requestCtx);
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(AdapterError);
		expect((thrown as AdapterError).code).toBe(
			"adapter.request.unsupported_parameter",
		);
		expect((thrown as AdapterError).context).toEqual(
			expect.objectContaining({
				provider: "zhipu",
				model: "glm-5.1",
				parameter: "tools",
				maxTools: 128,
				toolCount: 129,
			}),
		);
	});

	test("skips tools that are not in the supported tool type set", () => {
		const testCtx = ctx({
			input: "Hi",
			tools: [
				{
					type: "function",
					name: "get_weather",
					parameters: { type: "object" },
					strict: true,
				},
				{ type: "code_interpreter", container: { type: "auto" } },
			],
		});

		const result = mapRequest(testCtx);

		expect(result.tools).toEqual([
			{
				type: "function",
				function: {
					name: "get_weather",
					parameters: { type: "object" },
					description: "",
				},
			},
		]);
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.tool.unsupported",
				severity: "warn",
				path: "tools[type=code_interpreter]",
				action: "ignored",
				metadata: { toolType: "code_interpreter" },
			}),
		);
	});

	test("maps Codex tool call history to chat tool messages", () => {
		const result = mapRequest(
			ctx({
				input: [
					{
						type: "shell_call",
						call_id: "call_shell",
						action: { commands: ["pwd"] },
						status: "completed",
					},
					{
						type: "shell_call_output",
						call_id: "call_shell",
						output: [
							{
								stdout: "/tmp/project\n",
								stderr: "",
								outcome: { type: "exit", exit_code: 0 },
							},
						],
					},
					{
						type: "apply_patch_call",
						call_id: "call_patch",
						operation: {
							type: "update_file",
							path: "README.md",
							diff: "@@ -1 +1 @@\n-old\n+new",
						},
						status: "completed",
					},
					{
						type: "apply_patch_call_output",
						call_id: "call_patch",
						status: "completed",
						output: "Success",
					},
					{
						type: "custom_tool_call",
						call_id: "call_custom",
						name: "read-file",
						input: "README.md",
					},
					{
						type: "custom_tool_call_output",
						call_id: "call_custom",
						output: "contents",
					},
					{ role: "user", content: "Summarize the edits." },
				],
			}),
		);

		expect(result.messages).toEqual([
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_shell",
						type: "function",
						function: {
							name: "shell",
							arguments: '{"commands":["pwd"]}',
						},
					},
				],
			},
			{
				role: "tool",
				content: "[exit 0]\nstdout:\n/tmp/project\n\nstderr:\n",
				tool_call_id: "call_shell",
			},
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_patch",
						type: "function",
						function: {
							name: "apply_patch",
							arguments:
								'{"operation":{"type":"update_file","path":"README.md","diff":"@@ -1 +1 @@\\n-old\\n+new"}}',
						},
					},
				],
			},
			{
				role: "tool",
				content: "completed: Success",
				tool_call_id: "call_patch",
			},
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_custom",
						type: "function",
						function: {
							name: "read_file",
							arguments: '{"input":"README.md"}',
						},
					},
				],
			},
			{
				role: "tool",
				content: "contents",
				tool_call_id: "call_custom",
			},
			{ role: "user", content: "Summarize the edits." },
		]);
	});

	test("maps downgraded local_shell and tool_search history with matching function arguments", () => {
		const result = mapRequest(
			ctx({
				input: [
					{
						id: "lsh_1",
						type: "local_shell_call",
						call_id: "call_local",
						action: {
							type: "exec",
							command: ["pwd"],
							env: {},
							user: "sandbox",
						},
						status: "completed",
					},
					{
						id: "call_local",
						type: "local_shell_call_output",
						output: '{"exit_code":0,"stdout":"/tmp/project\\n"}',
						status: "completed",
					},
					{
						type: "tool_search_call",
						call_id: "call_search",
						arguments: { query: "workspace tools" },
						execution: "client",
					},
					{
						type: "tool_search_output",
						call_id: "call_search",
						tools: [
							{
								type: "function",
								name: "read_file",
								parameters: { type: "object" },
								strict: true,
							},
						],
					},
				],
			}),
		);

		expect(result.messages).toEqual([
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_local",
						type: "function",
						function: {
							name: "local_shell",
							arguments: '{"command":["pwd"],"env":{},"user":"sandbox"}',
						},
					},
				],
			},
			{
				role: "tool",
				content: '{"exit_code":0,"stdout":"/tmp/project\\n"}',
				tool_call_id: "call_local",
			},
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_search",
						type: "function",
						function: {
							name: "tool_search",
							arguments: '{"query":"workspace tools"}',
						},
					},
				],
			},
			{
				role: "tool",
				content:
					'[{"type":"function","name":"read_file","parameters":{"type":"object"},"strict":true}]',
				tool_call_id: "call_search",
			},
		]);
	});

	test("preserves zero-valued shell call options in downgraded history", () => {
		const result = mapRequest(
			ctx({
				input: [
					{
						type: "shell_call",
						call_id: "call_shell",
						action: {
							commands: ["pwd"],
							timeout_ms: 0,
							max_output_length: 0,
						},
						status: "completed",
					},
				],
			}),
		);

		expect(result.messages[0]).toEqual({
			role: "assistant",
			content: "",
			tool_calls: [
				{
					id: "call_shell",
					type: "function",
					function: {
						name: "shell",
						arguments:
							'{"commands":["pwd"],"timeout_ms":0,"max_output_length":0}',
					},
				},
			],
		});
	});

	test("records diagnostics while skipping unsupported current input content", () => {
		const testCtx = ctx({
			input: [
				{
					role: "user",
					content: [
						{
							type: "input_image",
							image_url: "https://example.com/cat.png",
						},
						{
							type: "input_text",
							text: "Hello",
						},
					],
				},
			],
		});

		const request = mapRequest(testCtx);

		expect(request.messages).toEqual([{ role: "user", content: "Hello" }]);
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.input.unsupported_content",
				severity: "warn",
				path: "input[0].content[0]",
				action: "ignored",
			}),
		);
	});

	test("gracefully skips unsupported provider-side tools", () => {
		const testCtx = ctx({
			input: "Hello",
			tools: [
				{
					type: "code_interpreter",
					container: { type: "auto" },
				},
				{
					type: "image_generation",
				},
				{
					type: "computer_use_preview",
					display_height: 768,
					display_width: 1024,
					environment: "browser",
				},
			],
		});

		const result = mapRequest(testCtx);

		expect(result.tools).toBeUndefined();
		expect(testCtx.diagnostics.map((d) => d.metadata?.toolType)).toEqual([
			"code_interpreter",
			"image_generation",
			"computer_use_preview",
		]);
	});

	test("records degraded diagnostics for custom tools mapped to functions", () => {
		const testCtx = ctx({
			input: "Hi",
			tools: [
				{
					type: "custom",
					name: "raw_sql",
					format: {
						type: "grammar",
						syntax: "lark",
						definition: "start: /.+/",
					},
				},
			],
		});

		const result = mapRequest(testCtx);

		expect(result.tools?.[0]).toMatchObject({
			type: "function",
			function: { name: "raw_sql" },
		});
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.tool.degraded",
				path: "tools[type=custom]",
				action: "degraded",
			}),
		);
	});
});
