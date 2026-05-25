import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ToolCallSnapshot } from "../../adapter/mapper/stream-response-state";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { createLogger } from "../../logger";
import type { ResponseItem } from "../../protocol/openai/responses";
import {
	ChatCompletionStreamMapper,
	type ChatStreamChoice,
	type ChatStreamToolCallDelta,
} from "./chat-stream-mapper";

interface TestChunk {
	delta?: {
		content?: string;
		tool_calls?: ChatStreamToolCallDelta[];
	};
	finish_reason?: string | null;
}

class TestStreamMapper extends ChatCompletionStreamMapper<
	TestChunk,
	NonNullable<TestChunk["delta"]>,
	string
> {
	protected extractChoice(
		chunk: TestChunk,
	): ChatStreamChoice<NonNullable<TestChunk["delta"]>, string> | null {
		return {
			delta: chunk.delta ?? {},
			finishReason: chunk.finish_reason,
		};
	}

	protected extractText(delta: NonNullable<TestChunk["delta"]>): string {
		return delta.content ?? "";
	}

	protected override extractToolCalls(
		delta: NonNullable<TestChunk["delta"]>,
	): ChatStreamToolCallDelta[] {
		return delta.tool_calls ?? [];
	}

	protected mapFinishReason() {
		return { status: "completed" as const };
	}

	protected mapToolCall(
		_ctx: ResponsesContext,
		call: ToolCallSnapshot,
	): ResponseItem {
		return {
			type: "function_call",
			call_id: call.id,
			name: call.name,
			arguments: call.arguments,
		} satisfies ResponseItem;
	}
}

function ctx(): ResponsesContext {
	return {
		request: { model: "test", stream: true } as never,
		resolved: { provider: "test", model: "test" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: { mapper: {} as never, client: {} as never },
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

function sse(chunk: TestChunk): JsonServerSentEvent<TestChunk> {
	return { event: "chunk", data: chunk };
}

describe("ChatCompletionStreamMapper", () => {
	test("handles the shared chat stream lifecycle", () => {
		const mapper = new TestStreamMapper();
		const testCtx = ctx();

		const startEvents = mapper.map(testCtx, sse({ delta: {} }));
		expect(startEvents.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
		]);

		const textEvents = mapper.map(
			testCtx,
			sse({ delta: { content: "Hello" } }),
		);
		expect(textEvents).toEqual([
			expect.objectContaining({
				type: "response.output_item.added",
				output_index: 0,
				item: expect.objectContaining({ type: "message" }),
			}),
			expect.objectContaining({
				type: "response.content_part.added",
				item_id: "msg_resp_1_0",
				output_index: 0,
				content_index: 0,
				part: expect.objectContaining({ type: "output_text" }),
			}),
			expect.objectContaining({
				type: "response.output_text.delta",
				item_id: "msg_resp_1_0",
				output_index: 0,
				content_index: 0,
				delta: "Hello",
			}),
		]);

		mapper.map(
			testCtx,
			sse({
				delta: {
					tool_calls: [
						{
							index: 0,
							id: "call_1",
							function: { name: "tool", arguments: '{"a"' },
						},
					],
				},
			}),
		);
		mapper.map(
			testCtx,
			sse({
				delta: {
					tool_calls: [
						{
							index: 0,
							function: { arguments: ":1}" },
						},
					],
				},
			}),
		);

		const endEvents = mapper.map(testCtx, sse({ finish_reason: "stop" }));
		expect(endEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_text.done",
					item_id: "msg_resp_1_0",
					output_index: 0,
					content_index: 0,
					text: "Hello",
				}),
				expect.objectContaining({
					type: "response.output_item.done",
					output_index: 0,
					item: expect.objectContaining({
						type: "message",
						status: "completed",
					}),
				}),
				expect.objectContaining({
					type: "response.function_call_arguments.done",
					item_id: "call_1",
					output_index: 1,
					text: '{"a":1}',
				}),
				expect.objectContaining({
					type: "response.output_item.done",
					output_index: 1,
					item: expect.objectContaining({ type: "function_call" }),
				}),
				expect.objectContaining({
					type: "response.completed",
					response: expect.objectContaining({
						id: "resp_1",
						status: "completed",
						output: expect.arrayContaining([
							expect.objectContaining({ type: "message" }),
							expect.objectContaining({ type: "function_call" }),
						]),
					}),
				}),
			]),
		);
	});
});
