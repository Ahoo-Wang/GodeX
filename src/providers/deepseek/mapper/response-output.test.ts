import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../../adapter/compatibility";
import {
	ProviderToolIndex,
	ToolIdentityCatalog,
	ToolIndexSlot,
} from "../../../adapter/mapper/chat/tool-index";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type {
	ResponseCreateRequest,
	ResponseObject,
} from "../../../protocol/openai/responses";
import { toDeepSeekFunctionName } from "../function-names";
import type { ChatCompletion, FinishReason } from "../protocol/completions";
import { createDeepSeekMapper } from "./index";

function ctx(partial: Partial<ResponseCreateRequest> = {}): ResponsesContext {
	const diagnostics: CompatibilityDiagnostic[] = [];
	const context = {
		request: {
			model: "deepseek-v4-flash",
			input: "Hello",
			...partial,
		} as ResponseCreateRequest,
		resolved: { provider: "deepseek", model: "deepseek-v4-flash" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as ApplicationContext,
		provider: { name: "deepseek", mapper: {} as never, client: {} as never },
		diagnostics,
		addDiagnostic(d: CompatibilityDiagnostic) {
			diagnostics.push(d);
		},
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
				toDeepSeekFunctionName,
			),
		}),
	);
	(context as ResponsesContext & { toolIndex: ToolIndexSlot }).toolIndex = slot;
	return context;
}

function mapResponse(
	c: ResponsesContext,
	response: ChatCompletion,
): ResponseObject {
	return createDeepSeekMapper().response.map(c, response) as ResponseObject;
}

function completion(finishReason: FinishReason): ChatCompletion {
	return {
		id: "chatcmpl_1",
		created: 1_764_000_000,
		model: "deepseek-v4-flash",
		choices: [
			{
				index: 0,
				finish_reason: finishReason,
				message: { role: "assistant", content: "Answer" },
			},
		],
	};
}

describe("DeepSeek response mapping", () => {
	test("maps reasoning, message text, and usage cache details", () => {
		const response = mapResponse(ctx(), {
			id: "chatcmpl_1",
			created: 1_764_000_000,
			model: "deepseek-v4-flash",
			choices: [
				{
					index: 0,
					finish_reason: "stop",
					message: {
						role: "assistant",
						content: "Answer",
						reasoning_content: "Thought",
					},
				},
			],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
				prompt_cache_hit_tokens: 7,
				prompt_cache_miss_tokens: 3,
				completion_tokens_details: { reasoning_tokens: 2 },
			},
		});

		expect(response.status).toBe("completed");
		expect(response.output).toEqual([
			{
				id: "rs_resp_1",
				type: "reasoning",
				summary: [{ type: "summary_text", text: "Thought" }],
			},
			{
				id: "msg_resp_1",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "Answer" }],
			},
		]);
		expect(response.output_text).toBe("Answer");
		expect(response.usage?.input_tokens_details?.cached_tokens).toBe(7);
		expect(response.usage?.output_tokens_details?.reasoning_tokens).toBe(2);
	});

	test("maps tool calls to Responses function_call items", () => {
		const response = mapResponse(
			ctx({
				tools: [
					{
						type: "function",
						name: "get_weather",
						parameters: { type: "object" },
						strict: true,
					},
				],
			}),
			{
				id: "chatcmpl_1",
				created: 1_764_000_000,
				model: "deepseek-v4-flash",
				choices: [
					{
						index: 0,
						finish_reason: "tool_calls",
						message: {
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
						},
					},
				],
			},
		);

		expect(response.status).toBe("completed");
		expect(response.output).toEqual([
			{
				id: "msg_resp_1",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [],
			},
			{
				type: "function_call",
				call_id: "call_weather",
				name: "get_weather",
				arguments: '{"city":"Beijing"}',
			},
		]);
	});

	test("restores downgraded custom and namespace tool calls", () => {
		const response = mapResponse(
			ctx({
				tools: [
					{
						type: "custom",
						name: "read.file",
					},
					{
						type: "namespace",
						name: "workspace",
						description: "Workspace tools",
						tools: [
							{
								type: "function",
								name: "list-files",
								parameters: { type: "object" },
							},
						],
					},
				],
			}),
			{
				id: "chatcmpl_1",
				created: 1_764_000_000,
				model: "deepseek-v4-flash",
				choices: [
					{
						index: 0,
						finish_reason: "tool_calls",
						message: {
							role: "assistant",
							content: "",
							tool_calls: [
								{
									id: "call_read",
									type: "function",
									function: {
										name: "read_file",
										arguments: '{"input":"README.md"}',
									},
								},
								{
									id: "call_list",
									type: "function",
									function: {
										name: "workspace__list-files",
										arguments: "{}",
									},
								},
							],
						},
					},
				],
			},
		);

		expect(response.output).toContainEqual({
			type: "custom_tool_call",
			call_id: "call_read",
			name: "read.file",
			input: "README.md",
		});
		expect(response.output).toContainEqual({
			type: "function_call",
			call_id: "call_list",
			namespace: "workspace",
			name: "list-files",
			arguments: "{}",
		});
	});

	test("maps length and content filter to incomplete", () => {
		expect(mapResponse(ctx(), completion("length")).status).toBe("incomplete");
		expect(mapResponse(ctx(), completion("content_filter")).status).toBe(
			"incomplete",
		);
	});

	test("maps insufficient system resource and empty choices to failed", () => {
		expect(
			mapResponse(ctx(), completion("insufficient_system_resource")).status,
		).toBe("failed");
		expect(
			mapResponse(ctx(), completion("unknown_reason" as FinishReason)).error,
		).toEqual({
			code: "server_error",
			message: "Unexpected DeepSeek finish reason: unknown_reason",
		});
		expect(
			mapResponse(ctx(), {
				id: "empty",
				created: 1,
				model: "deepseek-v4-flash",
				choices: [],
			}).status,
		).toBe("failed");
	});
});
