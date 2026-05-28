import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import {
	ProviderToolIndex,
	ToolIdentityCatalog,
	ToolIndexSlot,
} from "../../../adapter/mapper/chat/tool-index";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type { ChatCompletionChunk } from "../../../protocol/openai/completions";
import type {
	ResponseStreamEvent,
	ResponseTool,
} from "../../../protocol/openai/responses";
import { createOpenAIMapper } from "./index";

function ctx(requestOverrides: Record<string, unknown> = {}): ResponsesContext {
	const context = {
		request: {
			model: "gpt-4o",
			stream: true,
			...requestOverrides,
		} as never,
		resolved: { provider: "openai", model: "gpt-4o" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: {
			name: "openai",
			mapper: {} as never,
			client: {} as never,
		},
		attributes: new Map(),
	} as unknown as ResponsesContext;
	return withToolIndex(context);
}

function withToolIndex(context: ResponsesContext): ResponsesContext {
	const slot = new ToolIndexSlot();
	slot.set(
		new ProviderToolIndex({
			declarations: [],
			identityCatalog: ToolIdentityCatalog.fromTools(
				context.request.tools as ResponseTool[] | undefined,
			),
		}),
	);
	(context as ResponsesContext & { toolIndex: ToolIndexSlot }).toolIndex = slot;
	return context;
}

function chunk(
	overrides: Partial<ChatCompletionChunk> = {},
): ChatCompletionChunk {
	return {
		id: "chatcmpl_1",
		object: "chat.completion.chunk",
		created: 1_764_000_000,
		model: "gpt-4o",
		choices: [
			{
				index: 0,
				delta: { role: "assistant" },
				finish_reason: null,
				logprobs: null,
			},
		],
		...overrides,
	};
}

function sse(
	overrides: Partial<ChatCompletionChunk> = {},
): JsonServerSentEvent<ChatCompletionChunk> {
	return { data: chunk(overrides), event: "chunk" };
}

function terminalEvent(events: ResponseStreamEvent[]) {
	return events.find(
		(event) =>
			event.type === "response.completed" ||
			event.type === "response.incomplete" ||
			event.type === "response.failed",
	);
}

describe("OpenAIStreamMapper", () => {
	const streamMapper = createOpenAIMapper().stream;
	const mapStream = (
		c: ResponsesContext,
		e: JsonServerSentEvent<ChatCompletionChunk>,
	): ResponseStreamEvent[] => streamMapper.map(c, e) as ResponseStreamEvent[];

	test("maps content and refusal deltas through the shared stream lifecycle", () => {
		const testCtx = ctx();
		const startEvents = mapStream(testCtx, sse());
		expect(startEvents.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
		]);

		const contentEvents = mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: { content: "Hello", refusal: "No" },
						finish_reason: null,
						logprobs: null,
					},
				],
			}),
		);

		expect(contentEvents).toEqual([
			expect.objectContaining({ type: "response.output_item.added" }),
			expect.objectContaining({ type: "response.content_part.added" }),
			expect.objectContaining({
				type: "response.output_text.delta",
				delta: "Hello",
			}),
			expect.objectContaining({ type: "response.output_item.added" }),
			expect.objectContaining({ type: "response.content_part.added" }),
			expect.objectContaining({
				type: "response.refusal.delta",
				delta: "No",
			}),
		]);
	});

	test("restores namespace tool call identity consistently from added through done", () => {
		const testCtx = ctx({
			tools: [
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
			],
		});

		const addedEvents = mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									type: "function",
									id: "call_namespace",
									function: {
										name: "mcp__node_repl____js",
										arguments: '{"code"',
									},
								} as never,
							],
						},
						finish_reason: null,
						logprobs: null,
					},
				],
			}),
		);

		const added = addedEvents.find(
			(e): e is typeof e & { item: { call_id: string } } =>
				e.type === "response.output_item.added" && "call_id" in (e.item ?? {}),
		);
		expect(added).toMatchObject({
			type: "response.output_item.added",
			item: {
				type: "function_call",
				call_id: "call_namespace",
				namespace: "mcp__node_repl__",
				name: "js",
				arguments: "",
			},
		});
		mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									function: { arguments: ':"1 + 1"}' },
								} as never,
							],
						},
						finish_reason: null,
						logprobs: null,
					},
				],
			}),
		);

		const events = mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {},
						finish_reason: "tool_calls",
						logprobs: null,
					},
				],
			}),
		);

		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_item.done",
					item: {
						type: "function_call",
						call_id: "call_namespace",
						namespace: "mcp__node_repl__",
						name: "js",
						arguments: '{"code":"1 + 1"}',
						status: "completed",
					},
				}),
			]),
		);
		// Terminal is deferred; no terminal event in finish chunk
		expect(terminalEvent(events)).toBeUndefined();

		// Usage chunk flushes the pending terminal
		const usageEvents = mapStream(
			testCtx,
			sse({
				choices: [],
				usage: {
					prompt_tokens: 100,
					completion_tokens: 50,
					total_tokens: 150,
				},
			} as Partial<ChatCompletionChunk> as ChatCompletionChunk),
		);

		expect(terminalEvent(usageEvents)).toMatchObject({
			type: "response.completed",
			response: {
				status: "completed",
				usage: {
					input_tokens: 100,
					output_tokens: 50,
					total_tokens: 150,
				},
				output: expect.arrayContaining([
					expect.objectContaining({
						type: "function_call",
						call_id: "call_namespace",
						namespace: "mcp__node_repl__",
						name: "js",
						arguments: '{"code":"1 + 1"}',
						status: "completed",
					}),
				]),
			},
		});
	});

	test("streams downgraded namespace custom tool calls as custom_tool_call items", () => {
		const testCtx = ctx({
			tools: [
				{
					type: "namespace",
					name: "workspace",
					description: "Workspace tools",
					tools: [{ type: "custom", name: "raw" }],
				},
			],
		});
		mapStream(testCtx, sse());

		const addedEvents = mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									type: "function",
									id: "call_raw",
									function: {
										name: "workspace__raw",
										arguments: '{"input":"select',
									},
								} as never,
							],
						},
						finish_reason: null,
						logprobs: null,
					},
				],
			}),
		);

		expect(addedEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_item.added",
					item: {
						type: "custom_tool_call",
						call_id: "call_raw",
						namespace: "workspace",
						name: "raw",
						input: "",
						status: "in_progress",
					},
				}),
			]),
		);

		mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									function: { arguments: ' 1"}' },
								} as never,
							],
						},
						finish_reason: null,
						logprobs: null,
					},
				],
			}),
		);

		const doneEvents = mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {},
						finish_reason: "tool_calls",
						logprobs: null,
					},
				],
			}),
		);

		expect(doneEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_item.done",
					item: {
						type: "custom_tool_call",
						call_id: "call_raw",
						namespace: "workspace",
						name: "raw",
						input: "select 1",
						status: "completed",
					},
				}),
			]),
		);
	});

	test("streams custom tool calls as custom_tool_call items", () => {
		const testCtx = ctx();
		mapStream(testCtx, sse());

		const addedEvents = mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									type: "custom",
									id: "call_custom",
									custom: {
										name: "raw_sql",
										input: "select",
									},
								} as never,
							],
						},
						finish_reason: null,
						logprobs: null,
					},
				],
			}),
		);

		expect(addedEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_item.added",
					item: {
						type: "custom_tool_call",
						call_id: "call_custom",
						name: "raw_sql",
						input: "",
						status: "in_progress",
					},
				}),
				expect.objectContaining({
					type: "response.custom_tool_call_input.delta",
					delta: "select",
				}),
			]),
		);

		mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									custom: { input: " 1" },
								} as never,
							],
						},
						finish_reason: null,
						logprobs: null,
					},
				],
			}),
		);

		const doneEvents = mapStream(
			testCtx,
			sse({
				choices: [
					{
						index: 0,
						delta: {},
						finish_reason: "tool_calls",
						logprobs: null,
					},
				],
			}),
		);

		expect(doneEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.custom_tool_call_input.done",
					text: "select 1",
				}),
				expect.objectContaining({
					type: "response.output_item.done",
					item: {
						type: "custom_tool_call",
						call_id: "call_custom",
						name: "raw_sql",
						input: "select 1",
						status: "completed",
					},
				}),
			]),
		);
	});
});
