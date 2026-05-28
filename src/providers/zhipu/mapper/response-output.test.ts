// src/providers/zhipu/response.test.ts
import { describe, expect, test } from "bun:test";
import {
	ProviderToolIndex,
	ToolIdentityCatalog,
	ToolIndexSlot,
} from "../../../adapter/mapper/chat/tool-index";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type {
	ResponseObject,
	ResponseTool,
} from "../../../protocol/openai/responses";
import { toZhipuFunctionName } from "../function-names";
import type { ChatCompletionResponse } from "../protocol/completions";
import { createZhipuMapper } from "./index";

function ctx(requestOverrides: Record<string, unknown> = {}): ResponsesContext {
	const context = {
		request: {
			model: "gpt-5",
			instructions: "Be concise.",
			previous_response_id: "resp_prev",
			temperature: 0.5,
			top_p: 0.9,
			max_output_tokens: 100,
			max_tool_calls: 3,
			tool_choice: "auto",
			tools: [
				{
					type: "function",
					name: "get_weather",
					parameters: { type: "object" },
					strict: true,
				},
			],
			parallel_tool_calls: false,
			store: true,
			stream: false,
			metadata: { tenant: "test" },
			prompt: {
				id: "prompt_1",
				version: "1",
				variables: { city: "Beijing" },
			},
			service_tier: "default",
			context_management: [{ type: "auto", compact_threshold: 0.8 }],
			conversation: { id: "conv_1" },
			reasoning: { effort: "high", summary: "auto" },
			text: { format: { type: "text" }, verbosity: "low" },
			truncation: "auto",
			user: "user_1",
			prompt_cache_key: "cache_1",
			prompt_cache_retention: "24h",
			safety_identifier: "safe_1",
			include: ["web_search_call.action.sources"],
			background: false,
			...requestOverrides,
		} as never,
		resolved: { provider: "zhipu", model: "glm-5.1" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: { mapper: {} as never, client: {} as never },
	} as unknown as ResponsesContext;
	return withToolIndex(context);
}

function withToolIndex(context: ResponsesContext): ResponsesContext {
	const slot = new ToolIndexSlot();
	slot.set(
		new ProviderToolIndex({
			declarations: [],
			identityCatalog: ToolIdentityCatalog.fromTools(
				context.request.tools,
				toZhipuFunctionName,
			),
		}),
	);
	(context as ResponsesContext & { toolIndex: ToolIndexSlot }).toolIndex = slot;
	return context;
}

function withTools(tools: ResponseTool[]): ResponsesContext {
	return ctx({ tools });
}

const zhipuResponse: ChatCompletionResponse = {
	id: "zhipu_task_1",
	created: 1_764_000_001,
	model: "glm-5.1",
	choices: [
		{
			index: 0,
			message: {
				role: "assistant",
				content: "Hello! How can I help?",
			},
			finish_reason: "stop",
		},
	],
	usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

const responseMapper = createZhipuMapper().response;
const mapResponse = (
	c: ResponsesContext,
	r: ChatCompletionResponse,
): ResponseObject => responseMapper.map(c, r) as ResponseObject;

describe("buildResponseObject", () => {
	test("maps basic text response", () => {
		const result = mapResponse(ctx(), zhipuResponse);

		expect(result.id).toBe("resp_1");
		expect(result.object).toBe("response");
		expect(result.status).toBe("completed");
		expect(result.model).toBe("glm-5.1");
		expect(result.output).toHaveLength(1);
		expect(result.output[0]?.type).toBe("message");
		if (result.output[0]?.type === "message") {
			expect(result.output[0]?.role).toBe("assistant");
		}
		expect(result.output_text).toBe("Hello! How can I help?");
		expect(result.usage).toEqual({
			input_tokens: 10,
			output_tokens: 5,
			total_tokens: 15,
		});
		expect(result).toMatchObject({
			instructions: "Be concise.",
			previous_response_id: "resp_prev",
			temperature: 0.5,
			top_p: 0.9,
			max_output_tokens: 100,
			max_tool_calls: 3,
			tool_choice: "auto",
			parallel_tool_calls: false,
			store: true,
			stream: false,
			metadata: { tenant: "test" },
			prompt: {
				id: "prompt_1",
				version: "1",
				variables: { city: "Beijing" },
			},
			service_tier: "default",
			context_management: [{ type: "auto", compact_threshold: 0.8 }],
			conversation: { id: "conv_1" },
			reasoning: { effort: "high", summary: "auto" },
			text: { format: { type: "text" }, verbosity: "low" },
			truncation: "auto",
			user: "user_1",
			prompt_cache_key: "cache_1",
			prompt_cache_retention: "24h",
			safety_identifier: "safe_1",
			include: ["web_search_call.action.sources"],
			background: false,
		});
		expect(result.tools).toHaveLength(1);
	});

	test("preserves zero cached token usage", () => {
		const result = mapResponse(ctx(), {
			...zhipuResponse,
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
				prompt_tokens_details: { cached_tokens: 0 },
			},
		});

		expect(result.usage).toEqual({
			input_tokens: 10,
			output_tokens: 5,
			total_tokens: 15,
			input_tokens_details: { cached_tokens: 0 },
		});
	});

	test("preserves empty output_text when assistant content is empty", () => {
		const emptyText: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "",
					},
					finish_reason: "stop",
				},
			],
		};

		const result = mapResponse(ctx(), emptyText);

		expect(result.output_text).toBe("");
	});

	test("maps tool_calls to FunctionCall items", () => {
		const withTools: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "tc_1",
								type: "function",
								function: {
									name: "get_weather",
									arguments: '{"city":"Beijing"}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		};
		const result = mapResponse(ctx(), withTools);

		expect(result.output[0]?.type).toBe("message");
		expect(result.output[1]?.type).toBe("function_call");
		if (result.output[1]?.type === "function_call") {
			expect(result.output[1]?.call_id).toBe("tc_1");
			expect(result.output[1]?.name).toBe("get_weather");
			expect(result.output[1]?.arguments).toBe('{"city":"Beijing"}');
		}
	});

	test("restores downgraded local_shell tool calls to Responses built-in items", () => {
		const withLocalShell: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_shell",
								type: "function",
								function: {
									name: "local_shell",
									arguments:
										'{"command":["pwd"],"env":{"CI":"1"},"timeout_ms":1000,"working_directory":"/tmp"}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		};

		const result = mapResponse(
			withTools([{ type: "local_shell" }]),
			withLocalShell,
		);

		expect(result.output[1]).toEqual({
			id: "call_shell",
			type: "local_shell_call",
			call_id: "call_shell",
			action: {
				type: "exec",
				command: ["pwd"],
				env: { CI: "1" },
				timeout_ms: 1000,
				working_directory: "/tmp",
			},
			status: "in_progress",
		});
	});

	test("restores downgraded apply_patch and tool_search tool calls", () => {
		const withBuiltIns: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_patch",
								type: "function",
								function: {
									name: "apply_patch",
									arguments:
										'{"operation":{"type":"update_file","path":"README.md","diff":"@@\\n-old\\n+new\\n"}}',
								},
							},
							{
								id: "call_search",
								type: "function",
								function: {
									name: "tool_search",
									arguments: '{"query":"filesystem"}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		};

		const result = mapResponse(
			withTools([{ type: "apply_patch" }, { type: "tool_search" }]),
			withBuiltIns,
		);

		expect(result.output[1]).toEqual({
			type: "apply_patch_call",
			call_id: "call_patch",
			operation: {
				type: "update_file",
				path: "README.md",
				diff: "@@\n-old\n+new\n",
			},
			status: "in_progress",
		});
		expect(result.output[2]).toEqual({
			type: "tool_search_call",
			call_id: "call_search",
			arguments: { query: "filesystem" },
			execution: "server",
			status: "in_progress",
		});
	});

	test("restores custom tool calls with original tool names", () => {
		const withCustom: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
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
					finish_reason: "tool_calls",
				},
			],
		};

		const result = mapResponse(
			withTools([{ type: "custom", name: "read-file" }]),
			withCustom,
		);

		expect(result.output[1]).toEqual({
			type: "custom_tool_call",
			call_id: "call_custom",
			name: "read-file",
			input: "README.md",
		});
	});

	test("restores flattened namespace tool calls to FunctionCall namespace", () => {
		const withNamespaceTool: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_namespace",
								type: "function",
								function: {
									name: "mcp__node_repl____js",
									arguments: '{"code":"1 + 1"}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		};

		const result = mapResponse(
			withTools([
				{
					type: "namespace",
					name: "mcp__node_repl__",
					description: "Node REPL",
					tools: [
						{
							type: "function",
							name: "js",
							parameters: { type: "object" },
						},
					],
				},
			]),
			withNamespaceTool,
		);

		expect(result.output[1]).toEqual({
			type: "function_call",
			call_id: "call_namespace",
			namespace: "mcp__node_repl__",
			name: "js",
			arguments: '{"code":"1 + 1"}',
		});
	});

	test("falls back to FunctionCall when built-in tool arguments are incomplete", () => {
		const malformed: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_bad",
								type: "function",
								function: {
									name: "local_shell",
									arguments: '{"env":{"CI":"1"}}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
		};

		const result = mapResponse(withTools([{ type: "local_shell" }]), malformed);

		expect(result.output[1]).toEqual({
			type: "function_call",
			call_id: "call_bad",
			name: "local_shell",
			arguments: '{"env":{"CI":"1"}}',
		});
	});

	test("maps reasoning_content to Reasoning item", () => {
		const withReasoning: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "The answer is 42.",
						reasoning_content: "Let me think step by step...",
					},
					finish_reason: "stop",
				},
			],
		};
		const result = mapResponse(ctx(), withReasoning);

		expect(result.output).toHaveLength(2);
		expect(result.output[0]?.type).toBe("reasoning");
		expect(result.output[1]?.type).toBe("message");
	});

	test("maps web_search results to WebSearchCall items", () => {
		const withSearch: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Here is what I found.",
					},
					finish_reason: "stop",
				},
			],
			web_search: [
				{
					title: "Result 1",
					link: "https://example.com",
					content: "Some content",
				},
			],
		};
		const result = mapResponse(ctx(), withSearch);

		const searchItem = result.output.find(
			(item) => item.type === "web_search_call",
		);
		expect(searchItem).toBeDefined();
		if (searchItem && searchItem.type === "web_search_call") {
			expect(searchItem.status).toBe("completed");
			expect(searchItem.action).toEqual({
				type: "search",
				query: "",
				sources: [{ type: "url", url: "https://example.com" }],
			});
		}
	});

	test("maps length finish_reason to incomplete response", () => {
		const truncated: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Partial answer",
					},
					finish_reason: "length",
				},
			],
		};

		const result = mapResponse(ctx(), truncated);

		expect(result.status).toBe("incomplete");
		expect(result.incomplete_details).toEqual({ reason: "max_output_tokens" });
	});

	test("maps provider error finish_reason to failed response", () => {
		const failed: ChatCompletionResponse = {
			...zhipuResponse,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
					},
					finish_reason: "network_error",
				},
			],
		};

		const result = mapResponse(ctx(), failed);

		expect(result.status).toBe("failed");
		expect(result.error).toEqual({
			code: "server_error",
			message: "Zhipu finished with reason: network_error",
		});
	});
	test("maps empty choices to failed response", () => {
		const emptyChoices: ChatCompletionResponse = {
			id: "zhipu_task_1",
			created: 1_764_000_001,
			model: "glm-5.1",
			choices: [],
			usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
		};

		const result = mapResponse(ctx(), emptyChoices);

		expect(result.status).toBe("failed");
		expect(result.error).toEqual({
			code: "server_error",
			message: "Empty choices from upstream",
		});
		expect(result.output).toEqual([]);
		expect(result.output_text).toBe("");
		expect(result.usage).toBeNull();
	});
});
