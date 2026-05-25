import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { createLogger } from "../../logger";
import type { ChatCompletionChunk } from "../../protocol/openai/completions";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import { OpenAIStreamMapper } from "./stream";

function ctx(requestOverrides: Record<string, unknown> = {}): ResponsesContext {
	return {
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
	const mapper = new OpenAIStreamMapper();

	test("maps content and refusal deltas through the shared stream lifecycle", () => {
		const testCtx = ctx();
		const startEvents = mapper.map(testCtx, sse());
		expect(startEvents.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
		]);

		const contentEvents = mapper.map(
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
			expect.objectContaining({
				type: "response.output_text.delta",
				delta: "Hello",
			}),
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

		const addedEvents = mapper.map(
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
									type: "function",
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

		const events = mapper.map(
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
					},
				}),
			]),
		);
		expect(terminalEvent(events)).toMatchObject({
			type: "response.completed",
			response: {
				status: "completed",
				output: expect.arrayContaining([
					expect.objectContaining({
						type: "function_call",
						call_id: "call_namespace",
						namespace: "mcp__node_repl__",
						name: "js",
						arguments: '{"code":"1 + 1"}',
					}),
				]),
			},
		});
	});
});
