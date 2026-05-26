import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { CompatibilityDiagnostic } from "../../../adapter/compatibility";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type {
	ResponseCreateRequest,
	ResponseStreamEvent,
} from "../../../protocol/openai/responses";
import type { ChatCompletionChunk } from "../protocol/completions";
import { createDeepSeekMapper } from "./index";

function ctx(partial: Partial<ResponseCreateRequest> = {}): ResponsesContext {
	const diagnostics: CompatibilityDiagnostic[] = [];
	return {
		request: {
			model: "deepseek-v4-flash",
			input: "Hello",
			stream: true,
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
		attributes: new Map(),
		addDiagnostic(d: CompatibilityDiagnostic) {
			diagnostics.push(d);
		},
	} as unknown as ResponsesContext;
}

function chunk(
	overrides: Partial<ChatCompletionChunk> = {},
): ChatCompletionChunk {
	return {
		id: "chatcmpl_1",
		object: "chat.completion.chunk",
		created: 1_764_000_000,
		model: "deepseek-v4-flash",
		choices: [
			{
				index: 0,
				delta: { role: "assistant" },
				finish_reason: null,
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

describe("DeepSeek stream mapping", () => {
	const streamMapper = createDeepSeekMapper().stream;
	const mapStream = (
		c: ResponsesContext,
		e: JsonServerSentEvent<ChatCompletionChunk>,
	): ResponseStreamEvent[] => streamMapper.map(c, e) as ResponseStreamEvent[];

	test("streams reasoning and text deltas", () => {
		const c = ctx();
		const reasoningEvents = mapStream(
			c,
			sse({
				choices: [
					{
						index: 0,
						delta: { reasoning_content: "Think" },
						finish_reason: null,
					},
				],
			}),
		);
		const textEvents = mapStream(
			c,
			sse({
				choices: [
					{ index: 0, delta: { content: "Answer" }, finish_reason: null },
				],
			}),
		);

		expect(reasoningEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.reasoning_text.delta",
					delta: "Think",
				}),
			]),
		);
		expect(textEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_text.delta",
					delta: "Answer",
				}),
			]),
		);
	});

	test("streams tool call deltas and flushes terminal after usage", () => {
		const c = ctx({
			tools: [
				{
					type: "function",
					name: "get_weather",
					parameters: { type: "object" },
					strict: true,
				},
			],
		});
		mapStream(
			c,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									id: "call_weather",
									type: "function",
									function: { name: "get_weather", arguments: '{"city"' },
								},
							],
						},
						finish_reason: null,
					},
				],
			}),
		);

		const finishEvents = mapStream(
			c,
			sse({
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									function: { arguments: ':"Beijing"}' },
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			}),
		);
		expect(finishEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "response.output_item.done",
					item: expect.objectContaining({
						type: "function_call",
						call_id: "call_weather",
						name: "get_weather",
						arguments: '{"city":"Beijing"}',
						status: "completed",
					}),
				}),
			]),
		);
		expect(terminalEvent(finishEvents)).toBeUndefined();

		const usageEvents = mapStream(
			c,
			sse({
				choices: [],
				usage: {
					prompt_tokens: 3,
					completion_tokens: 2,
					total_tokens: 5,
				},
			}),
		);

		expect(terminalEvent(usageEvents)).toMatchObject({
			type: "response.completed",
			response: {
				status: "completed",
				usage: {
					input_tokens: 3,
					output_tokens: 2,
					total_tokens: 5,
				},
			},
		});
	});

	test("usage-only chunks update usage without text events", () => {
		const events = mapStream(
			ctx(),
			sse({
				choices: [],
				usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
			}),
		);

		expect(events).toEqual([]);
	});
});
