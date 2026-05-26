import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type { ResponseItem } from "../../../protocol/openai/responses";
import { ChatStreamMapper } from "./stream-mapper";

interface TestChunk {
	delta?: {
		content?: string;
		tool_calls?: Array<{
			index?: number;
			id?: string;
			function?: { name?: string; arguments?: string };
		}>;
	};
	finish_reason?: string | null;
}

function ctx(): ResponsesContext {
	return {
		request: { model: "test", stream: true } as never,
		resolved: { provider: "test", model: "test" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: { mapper: {} as never, client: {} as never },
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

function sse<T>(chunk: T): JsonServerSentEvent<T> {
	return { event: "chunk", data: chunk };
}

describe("ChatStreamMapper", () => {
	test("maps streamed text and tool calls through StreamResponseState", () => {
		const mapper = new ChatStreamMapper<
			TestChunk,
			NonNullable<TestChunk["delta"]>,
			string
		>({
			delta: {
				extractChoice: (chunk) => ({
					delta: chunk.delta ?? {},
					finishReason: chunk.finish_reason,
				}),
				extractText: (delta) => delta.content ?? "",
				extractReasoningText: () => "",
				extractRefusalText: () => "",
				extractToolCalls: (delta) => delta.tool_calls ?? [],
				extractUsage: () => undefined,
			},
			finishReason: { map: () => ({ status: "completed" }) },
			identity: {
				resolve: (_ctx, upstreamName) => ({ upstreamName, name: upstreamName }),
			},
			toolCall: {
				map: (_ctx, call, identity): ResponseItem => ({
					type: "function_call",
					call_id: call.id,
					name: identity.name,
					arguments: call.arguments,
				}),
			},
		});
		const testCtx = ctx();

		expect(
			mapper.map(testCtx, sse({ delta: {} })).map((event) => event.type),
		).toEqual(["response.created", "response.in_progress"]);
		expect(mapper.map(testCtx, sse({ delta: { content: "Hi" } }))).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_text.delta",
					delta: "Hi",
				}),
			]),
		);
		mapper.map(
			testCtx,
			sse({
				delta: {
					tool_calls: [
						{
							index: 0,
							id: "call_1",
							function: { name: "get_weather", arguments: '{"city"' },
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
							function: { arguments: ':"Paris"}' },
						},
					],
				},
			}),
		);

		expect(mapper.map(testCtx, sse({ finish_reason: "stop" }))).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.function_call_arguments.done",
					text: '{"city":"Paris"}',
				}),
				expect.objectContaining({
					type: "response.completed",
					response: expect.objectContaining({ status: "completed" }),
				}),
			]),
		);
	});

	test("usage-only chunks update state without starting a response", () => {
		type UsageChunk = TestChunk & { usage?: { total_tokens: number } };
		// biome-ignore lint/complexity/noBannedTypes: empty delta type is intentional — these chunks carry no content
		type UsageDelta = {};
		const mapper = new ChatStreamMapper<UsageChunk, UsageDelta, string>({
			delta: {
				extractChoice: () => null,
				extractText: () => "",
				extractReasoningText: () => "",
				extractRefusalText: () => "",
				extractToolCalls: () => [],
				extractUsage: (chunk) =>
					chunk.usage
						? {
								input_tokens: 0,
								output_tokens: 0,
								total_tokens: chunk.usage.total_tokens,
							}
						: undefined,
			},
			finishReason: { map: () => ({ status: "completed" }) },
			identity: {
				resolve: (_ctx, upstreamName) => ({
					upstreamName,
					name: upstreamName,
				}),
			},
			toolCall: {
				map: (_ctx, call): ResponseItem => ({
					type: "function_call",
					call_id: call.id,
					name: call.name,
					arguments: call.arguments,
				}),
			},
		});

		expect(
			mapper.map(ctx(), sse<UsageChunk>({ usage: { total_tokens: 3 } })),
		).toEqual([]);
	});
});
