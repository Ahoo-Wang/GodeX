// src/providers/zhipu/stream.test.ts
import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { createLogger } from "../../logger";
import type {
	ResponseObject,
	ResponseStreamEvent,
	ResponseTool,
} from "../../protocol/openai/responses";
import type { ChatCompletionChunk } from "./protocol/completions";
import { ZhipuStreamMapper } from "./stream";

function ctx(requestOverrides: Record<string, unknown> = {}): ResponsesContext {
	return {
		request: {
			model: "glm-5.1",
			stream: true,
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
				},
			],
			parallel_tool_calls: false,
			store: true,
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
		provider: { mapper: {} as never, chatClient: {} as never },
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

function withTools(tools: ResponseTool[]): ResponsesContext {
	return ctx({ tools });
}

function chunk(
	overrides: Partial<ChatCompletionChunk> = {},
): ChatCompletionChunk {
	return {
		id: "zhipu_1",
		created: 1_764_000_000,
		model: "glm-5.1",
		choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
		...overrides,
	};
}

function sse(
	overrides: Partial<ChatCompletionChunk> = {},
): JsonServerSentEvent<ChatCompletionChunk> {
	return { data: chunk(overrides), event: "chunk" };
}

function extractResponseObject(
	events: ResponseStreamEvent[],
): ResponseObject | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		const evt = events[i];
		if (
			evt?.type === "response.completed" ||
			evt?.type === "response.incomplete" ||
			evt?.type === "response.failed"
		) {
			return evt.response;
		}
	}
	return undefined;
}

describe("ZhipuStreamMapper", () => {
	const mapper = new ZhipuStreamMapper();

	test("first chunk produces created + in_progress + output_item.added + content_part.added", () => {
		const testCtx = ctx();
		const events = mapper.map(testCtx, sse());

		const types = events.map((e) => e.type);
		expect(types).toContain("response.created");
		expect(types).toContain("response.in_progress");
		expect(types).toContain("response.output_item.added");
		expect(types).toContain("response.content_part.added");
	});

	test("content delta produces output_text.delta", () => {
		const testCtx = ctx();
		mapper.map(testCtx, sse());

		const events = mapper.map(
			testCtx,
			sse({
				choices: [
					{ index: 0, delta: { content: "Hello" }, finish_reason: null },
				],
			}),
		);

		expect(events).toEqual([
			expect.objectContaining({
				type: "response.output_text.delta",
				delta: "Hello",
			}),
		]);
	});

	test("reasoning delta produces reasoning_text.delta", () => {
		const testCtx = ctx();
		mapper.map(testCtx, sse());

		const events = mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: { reasoning_content: "Let me think..." },
						finish_reason: null,
					},
				],
			}),
		);

		expect(events).toEqual([
			expect.objectContaining({
				type: "response.reasoning_text.delta",
				delta: "Let me think...",
			}),
		]);
	});

	test("finish_reason: stop produces completed events", () => {
		const testCtx = ctx();
		mapper.map(testCtx, sse());
		mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }],
			}),
		);

		const events = mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			}),
		);

		const types = events.map((e) => e.type);
		expect(types).toContain("response.output_text.done");
		expect(types).toContain("response.content_part.done");
		expect(types).toContain("response.output_item.done");
		expect(types).toContain("response.completed");
	});

	test("completed response echoes request fields like non-stream response", () => {
		const testCtx = ctx();
		mapper.map(testCtx, sse());
		mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }],
			}),
		);
		const events = mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			}),
		);

		const resp = extractResponseObject(events);
		expect(resp).toMatchObject({
			instructions: "Be concise.",
			previous_response_id: "resp_prev",
			temperature: 0.5,
			top_p: 0.9,
			max_output_tokens: 100,
			max_tool_calls: 3,
			tool_choice: "auto",
			parallel_tool_calls: false,
			store: true,
			stream: true,
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
	});

	test("tool call chunks are grouped by index and emit argument done events", () => {
		const testCtx = ctx();
		mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									id: "call_1",
									function: { name: "first", arguments: '{"a"' },
								},
								{
									index: 1,
									id: "call_2",
									function: { name: "second", arguments: '{"b"' },
								},
							],
						},
						finish_reason: null,
					},
				],
			}),
		);
		mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{ index: 0, function: { arguments: ":1}" } },
								{ index: 1, function: { arguments: ":2}" } },
							],
						},
						finish_reason: null,
					},
				],
			}),
		);

		const events = mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
			}),
		);

		const doneEvents = events.filter(
			(event) => event.type === "response.function_call_arguments.done",
		);
		expect(doneEvents).toEqual([
			expect.objectContaining({ item_id: "call_1", text: '{"a":1}' }),
			expect.objectContaining({ item_id: "call_2", text: '{"b":2}' }),
		]);

		const itemDoneEvents = events.filter(
			(event) =>
				event.type === "response.output_item.done" &&
				event.item?.type === "function_call",
		);
		expect(itemDoneEvents).toEqual([
			expect.objectContaining({
				item: expect.objectContaining({
					type: "function_call",
					call_id: "call_1",
					name: "first",
					arguments: '{"a":1}',
				}),
			}),
			expect.objectContaining({
				item: expect.objectContaining({
					type: "function_call",
					call_id: "call_2",
					name: "second",
					arguments: '{"b":2}',
				}),
			}),
		]);

		const resp = extractResponseObject(events) as { output: unknown[] };
		expect(resp?.output).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "function_call",
					call_id: "call_1",
					name: "first",
					arguments: '{"a":1}',
				}),
				expect.objectContaining({
					type: "function_call",
					call_id: "call_2",
					name: "second",
					arguments: '{"b":2}',
				}),
			]),
		);
	});

	test("merges tool call chunks when arguments arrive before function name", () => {
		const testCtx = ctx();
		mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									id: "call_late_name",
									function: { arguments: '{"city"' },
								},
							],
						},
						finish_reason: null,
					},
				],
			}),
		);

		const nameEvents = mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									function: { name: "get_weather", arguments: ':"Beijing"}' },
								},
							],
						},
						finish_reason: null,
					},
				],
			}),
		);
		expect(nameEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_item.added",
					item_id: "call_late_name",
					item: expect.objectContaining({
						type: "function_call",
						name: "get_weather",
					}),
				}),
				expect.objectContaining({
					type: "response.function_call_arguments.delta",
					item_id: "call_late_name",
					delta: '{"city"',
				}),
				expect.objectContaining({
					type: "response.function_call_arguments.delta",
					item_id: "call_late_name",
					delta: ':"Beijing"}',
				}),
			]),
		);

		const events = mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
			}),
		);

		const itemDoneEvents = events.filter(
			(event) =>
				event.type === "response.output_item.done" &&
				event.item?.type === "function_call",
		);
		expect(itemDoneEvents).toEqual([
			expect.objectContaining({
				item: expect.objectContaining({
					type: "function_call",
					call_id: "call_late_name",
					name: "get_weather",
					arguments: '{"city":"Beijing"}',
				}),
			}),
		]);
	});

	test("restores downgraded built-in tool calls in final stream output", () => {
		const testCtx = withTools([
			{ type: "local_shell" },
			{ type: "apply_patch" },
		]);
		mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									id: "call_shell",
									function: {
										name: "local_shell",
										arguments: '{"command":["pwd"],',
									},
								},
								{
									index: 1,
									id: "call_patch",
									function: {
										name: "apply_patch",
										arguments:
											'{"operation":{"type":"delete_file","path":"tmp.txt"}}',
									},
								},
							],
						},
						finish_reason: null,
					},
				],
			}),
		);
		mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									function: {
										arguments: '"env":{"CI":"1"},"timeout_ms":1000}',
									},
								},
							],
						},
						finish_reason: null,
					},
				],
			}),
		);

		const events = mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
			}),
		);

		const itemDoneEvents = events.filter(
			(event) =>
				event.type === "response.output_item.done" &&
				(event.item?.type === "local_shell_call" ||
					event.item?.type === "apply_patch_call"),
		);
		expect(itemDoneEvents).toEqual([
			expect.objectContaining({
				item: expect.objectContaining({
					type: "local_shell_call",
					call_id: "call_shell",
					action: {
						type: "exec",
						command: ["pwd"],
						env: { CI: "1" },
						timeout_ms: 1000,
					},
					status: "in_progress",
				}),
			}),
			expect.objectContaining({
				item: expect.objectContaining({
					type: "apply_patch_call",
					call_id: "call_patch",
					operation: { type: "delete_file", path: "tmp.txt" },
					status: "in_progress",
				}),
			}),
		]);

		const resp = extractResponseObject(events) as { output: unknown[] };
		expect(resp?.output).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "local_shell_call",
					call_id: "call_shell",
				}),
				expect.objectContaining({
					type: "apply_patch_call",
					call_id: "call_patch",
				}),
			]),
		);
	});

	test("finish_reason: length produces incomplete event and output snapshot", () => {
		const testCtx = ctx();
		mapper.map(testCtx, sse());
		mapper.map(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: { content: "Partial" },
						finish_reason: null,
					},
				],
			}),
		);

		const events = mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: {}, finish_reason: "length" }],
			}),
		);

		expect(events.at(-1)).toMatchObject({
			type: "response.incomplete",
			response: {
				status: "incomplete",
				incomplete_details: { reason: "max_output_tokens" },
			},
		});
		const resp = extractResponseObject(events);
		expect(resp).toMatchObject({
			status: "incomplete",
			incomplete_details: { reason: "max_output_tokens" },
		});
	});

	test("finish_reason: network_error produces failed event and output snapshot", () => {
		const testCtx = ctx();
		mapper.map(testCtx, sse());

		const events = mapper.map(
			testCtx,
			sse({
				choices: [{ index: 0, delta: {}, finish_reason: "network_error" }],
			}),
		);

		expect(events.at(-1)).toMatchObject({
			type: "response.failed",
			response: {
				status: "failed",
				error: {
					code: "server_error",
					message: "Zhipu finished with reason: network_error",
				},
			},
		});
		const resp = extractResponseObject(events);
		expect(resp).toMatchObject({
			status: "failed",
			error: {
				code: "server_error",
				message: "Zhipu finished with reason: network_error",
			},
		});
	});

	test("empty choices returns empty array", () => {
		const testCtx = ctx();
		const events = mapper.map(testCtx, sse({ choices: [] }));
		expect(events).toEqual([]);
	});
});
