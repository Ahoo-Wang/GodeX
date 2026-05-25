import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { createLogger } from "../../logger";
import type {
	ResponseItem,
	ResponseObject,
} from "../../protocol/openai/responses";
import {
	ChatCompletionStreamMapper,
	type ChatStreamChoice,
	type ChatStreamToolCallDelta,
} from "./chat-stream-mapper";
import { buildChatResponseObject } from "./response-object";

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

	protected mapToolCall(_ctx: ResponsesContext, item: { id: string }) {
		return {
			type: "function_call",
			call_id: item.id,
			name: "tool",
			arguments: "{}",
		} satisfies ResponseItem;
	}

	buildResponseObject(
		ctx: ResponsesContext,
		state: { outputText: string; completedAt: number | null },
	): ResponseObject {
		return buildChatResponseObject(
			ctx,
			{ status: "completed" },
			{
				outputText: state.outputText,
				completedAt: state.completedAt,
				output: [],
			},
		);
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
			"response.output_item.added",
			"response.content_part.added",
		]);

		const textEvents = mapper.map(
			testCtx,
			sse({ delta: { content: "Hello" } }),
		);
		expect(textEvents).toEqual([
			expect.objectContaining({
				type: "response.output_text.delta",
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
					type: "response.function_call_arguments.done",
					item_id: "call_1",
					text: '{"a":1}',
				}),
				expect.objectContaining({
					type: "response.completed",
				}),
			]),
		);
	});
});
