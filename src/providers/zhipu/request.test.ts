// src/providers/zhipu/request.test.ts
import { describe, expect, test } from "bun:test";
import { mergeCapabilities } from "../../adapter/capabilities";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { AdapterError } from "../../error";
import { createLogger, type LogAttr, type Logger } from "../../logger";
import type { ResponseCreateRequest } from "../../protocol/openai/responses";
import { buildZhipuRequest } from "./request";

function ctx(
	partial: Partial<ResponseCreateRequest> = {},
	session?: ResponsesContext["session"],
	logger: Logger = createLogger({ level: "error" }),
	capabilities = mergeCapabilities(),
): ResponsesContext {
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
			chatClient: {} as never,
			capabilities,
		},
	} as unknown as ResponsesContext;
}

describe("buildZhipuRequest", () => {
	test("converts string input to user message", () => {
		const result = buildZhipuRequest(
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
		const result = buildZhipuRequest(
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
		const result = buildZhipuRequest(sessionCtx);
		expect(result.messages[0]).toEqual({ role: "user", content: "First" });
		expect(result.messages[1]).toEqual({ role: "assistant", content: "Reply" });
		expect(result.messages[2]).toEqual({ role: "user", content: "Follow-up" });
	});

	test("preserves tool call IDs for function call outputs", () => {
		const result = buildZhipuRequest(
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
		const result = buildZhipuRequest(
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

		const result = buildZhipuRequest(sessionCtx);

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
		const result = buildZhipuRequest(
			ctx({
				reasoning: { effort: "high" },
			}),
		);
		expect(result.thinking).toEqual({ type: "enabled" });
	});

	test("clamps temperature to 1.0 max", () => {
		const result = buildZhipuRequest(ctx({ temperature: 1.5 }));
		expect(result.temperature).toBe(1.0);
	});

	test("clamps temperature to 0.0 min", () => {
		const result = buildZhipuRequest(ctx({ temperature: -0.3 }));
		expect(result.temperature).toBe(0);
	});

	test("maps max_output_tokens to max_tokens", () => {
		const result = buildZhipuRequest(ctx({ max_output_tokens: 4096 }));
		expect(result.max_tokens).toBe(4096);
	});

	test("maps safety identifiers to Zhipu user_id", () => {
		const safetyResult = buildZhipuRequest(
			ctx({ safety_identifier: "codex-user-1" }),
		);
		expect(safetyResult.user_id).toBe("codex-user-1");

		const deprecatedUserResult = buildZhipuRequest(
			ctx({ user: "legacy-user" }),
		);
		expect(deprecatedUserResult.user_id).toBe("legacy-user");
	});

	test("sets stream: true when requested", () => {
		const result = buildZhipuRequest(ctx({ stream: true }));
		expect(result.stream).toBe(true);
	});

	test("rejects unsupported Responses request options instead of silently ignoring them", () => {
		const unsupportedRequests: Array<Partial<ResponseCreateRequest>> = [
			{ background: true },
			{ conversation: { id: "conv_1" } },
			{ prompt: { id: "pmpt_1" } },
		];

		for (const request of unsupportedRequests) {
			expect(() => buildZhipuRequest(ctx(request))).toThrow(AdapterError);
		}
	});

	test("downgrades truncation auto instead of rejecting the request", () => {
		const warnings: Array<Record<string, unknown> | undefined> = [];
		const logger: Logger = {
			...createLogger({ level: "warn" }),
			warn: (_event, attr) => {
				warnings.push(typeof attr === "function" ? attr() : attr);
			},
		};

		const result = buildZhipuRequest(
			ctx({ input: "Hi", truncation: "auto" }, null, logger),
		);

		expect(result.messages).toEqual([{ role: "user", content: "Hi" }]);
		expect("truncation" in result).toBe(false);
		expect(warnings).toContainEqual(
			expect.objectContaining({
				request_id: "req_1",
				field: "truncation",
				strategy: "ignored",
			}),
		);
	});

	test("does not map parallel_tool_calls to Zhipu tool_stream", () => {
		const warnings: Array<Record<string, unknown> | undefined> = [];
		const logger: Logger = {
			...createLogger({ level: "warn" }),
			warn: (_event, attr) => {
				warnings.push(typeof attr === "function" ? attr() : attr);
			},
		};

		const result = buildZhipuRequest(
			ctx({ input: "Hi", parallel_tool_calls: true }, null, logger),
		);

		expect("tool_stream" in result).toBe(false);
		expect(warnings).toContainEqual(
			expect.objectContaining({
				request_id: "req_1",
				field: "parallel_tool_calls",
				strategy: "ignored",
			}),
		);
	});

	test("accepts optional OpenAI fields that are echoed but not sent to Zhipu", () => {
		const result = buildZhipuRequest(
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

	test("maps response_format json_schema to response_format json_object", () => {
		const result = buildZhipuRequest(
			ctx({
				text: { format: { type: "json_schema", name: "person", schema: {} } },
			}),
		);
		expect(result.response_format).toEqual({ type: "json_object" });
	});

	test("maps response_format json_object to response_format json_object", () => {
		const result = buildZhipuRequest(
			ctx({
				text: { format: { type: "json_object" } },
			}),
		);
		expect(result.response_format).toEqual({ type: "json_object" });
	});

	test('treats tool_choice "none" as an explicit no-tools downgrade', () => {
		const result = buildZhipuRequest(
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
		const warnings: Array<Record<string, unknown> | undefined> = [];
		const logger: Logger = {
			...createLogger({ level: "warn" }),
			warn: (_event, attr) => {
				warnings.push(typeof attr === "function" ? attr() : attr);
			},
		};

		const result = buildZhipuRequest(
			ctx(
				{
					tools: [
						{
							type: "function",
							name: "get_weather",
							parameters: { type: "object" },
							strict: true,
						},
					],
					tool_choice: "required",
				},
				null,
				logger,
			),
		);

		expect(result.tool_choice).toBe("auto");
		expect(warnings).toContainEqual(
			expect.objectContaining({
				request_id: "req_1",
				field: "tool_choice",
				strategy: "auto",
			}),
		);
	});

	test("rejects requests whose mapped tools exceed provider tool capacity", () => {
		const requestCtx = ctx(
			{
				input: "Hi",
				tools: [
					{
						type: "function",
						name: "first_tool",
						parameters: { type: "object" },
						strict: true,
					},
					{
						type: "function",
						name: "second_tool",
						parameters: { type: "object" },
						strict: true,
					},
				],
			},
			null,
			createLogger({ level: "error" }),
			mergeCapabilities({ maxTools: 1 }),
		);

		let thrown: unknown;
		try {
			buildZhipuRequest(requestCtx);
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
				maxTools: 1,
				toolCount: 2,
			}),
		);
	});

	test("skips tools that provider capabilities do not declare as supported", () => {
		const warnings: string[] = [];
		const logger: Logger = {
			...createLogger({ level: "error" }),
			warn: (_event: string, attr?: LogAttr) => {
				const data = typeof attr === "function" ? attr() : attr;
				warnings.push(data?.toolType as string);
			},
		};
		const requestCtx = ctx(
			{
				input: "Hi",
				tools: [
					{
						type: "function",
						name: "get_weather",
						parameters: { type: "object" },
						strict: true,
					},
					{ type: "web_search" },
				],
			},
			null,
			logger,
			mergeCapabilities({ supportedToolTypes: new Set(["function"]) }),
		);

		const result = buildZhipuRequest(requestCtx);

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
		expect(warnings).toEqual(["web_search"]);
	});

	test("maps Codex tool call history to chat tool messages", () => {
		const result = buildZhipuRequest(
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
		const result = buildZhipuRequest(
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

	test("throws instead of silently dropping unsupported current input content", () => {
		expect(() =>
			buildZhipuRequest(
				ctx({
					input: [
						{
							role: "user",
							content: [
								{
									type: "input_image",
									image_url: "https://example.com/cat.png",
								},
							],
						},
					],
				}),
			),
		).toThrow(AdapterError);
	});

	test("gracefully skips unsupported provider-side tools", () => {
		const warnings: string[] = [];
		const ctxWithWarn = {
			...ctx({
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
			}),
			logger: {
				...createLogger({ level: "error" }),
				warn: (_event: string, attr?: LogAttr) => {
					const data = typeof attr === "function" ? attr() : attr;
					warnings.push(data?.toolType as string);
				},
			},
		} as ResponsesContext;

		const result = buildZhipuRequest(ctxWithWarn);

		expect(result.tools).toBeUndefined();
		expect(warnings).toEqual([
			"code_interpreter",
			"image_generation",
			"computer_use_preview",
		]);
	});
});
