import { describe, expect, test } from "bun:test";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { GodeXError } from "../../error";
import { createLogger } from "../../logger";
import type { ResponseItem } from "../../protocol/openai/responses";
import {
	StreamResponsePhase,
	StreamResponseState,
	type ToolCallSnapshot,
} from "./stream-response-state";

function ctx(): ResponsesContext {
	return {
		request: {
			model: "test-model",
			stream: true,
			instructions: "Be concise.",
			metadata: { tenant: "test" },
		} as never,
		resolved: { provider: "test", model: "resolved-model" },
		session: null,
		responseId: "resp_test",
		requestId: "req_test",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: { mapper: {} as never, client: {} as never },
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

function toolMapper(call: ToolCallSnapshot): ResponseItem {
	return {
		type: "function_call",
		call_id: call.id,
		name: call.name,
		arguments: call.arguments,
	};
}

describe("StreamResponseState accessors and lifecycle", () => {
	test("from throws before create", () => {
		expect(() => StreamResponseState.from(ctx())).toThrow(GodeXError);
	});

	test("create stores queued snapshot and get/from retrieve the same instance", () => {
		const testCtx = ctx();
		const state = StreamResponseState.create(testCtx, {
			toolCallOutputItemMapper: toolMapper,
			nowSeconds: () => 1_764_000_010,
		});

		expect(StreamResponseState.get(testCtx)).toBe(state);
		expect(StreamResponseState.from(testCtx)).toBe(state);
		expect(state.phase).toBe(StreamResponsePhase.IDLE);
		expect(state.snapshot).toMatchObject({
			id: "resp_test",
			object: "response",
			created_at: 1_764_000_000,
			status: "queued",
			model: "resolved-model",
			output: [],
			instructions: "Be concise.",
			stream: true,
			metadata: { tenant: "test" },
		});
	});

	test("duplicate create throws an adapter domain error", () => {
		const testCtx = ctx();
		StreamResponseState.create(testCtx, {
			toolCallOutputItemMapper: toolMapper,
		});

		expect(() =>
			StreamResponseState.create(testCtx, {
				toolCallOutputItemMapper: toolMapper,
			}),
		).toThrow(GodeXError);
	});

	test("start emits created and in_progress with in-progress snapshot", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});

		const events = state.start();

		expect(state.phase).toBe(StreamResponsePhase.IN_PROGRESS);
		expect(state.snapshot.status).toBe("in_progress");
		expect(events).toEqual([
			expect.objectContaining({
				type: "response.created",
				response: expect.objectContaining({ status: "in_progress" }),
			}),
			expect.objectContaining({
				type: "response.in_progress",
				response: expect.objectContaining({ status: "in_progress" }),
			}),
		]);
	});

	test("repeated start throws", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		expect(() => state.start()).toThrow(GodeXError);
	});
});

describe("StreamResponseState message and reasoning output", () => {
	test("text delta opens message and content part with full indexes", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		const events = state.onTextDelta("Hi");

		expect(events).toEqual([
			expect.objectContaining({
				type: "response.output_item.added",
				output_index: 0,
				item: expect.objectContaining({
					id: "msg_resp_test_0",
					type: "message",
					status: "in_progress",
					role: "assistant",
					content: [],
				}),
			}),
			expect.objectContaining({
				type: "response.content_part.added",
				item_id: "msg_resp_test_0",
				output_index: 0,
				content_index: 0,
				part: { type: "output_text", text: "" },
			}),
			expect.objectContaining({
				type: "response.output_text.delta",
				item_id: "msg_resp_test_0",
				output_index: 0,
				content_index: 0,
				delta: "Hi",
			}),
		]);
		expect(state.snapshot.output_text).toBe("Hi");
	});

	test("text done closes text, content part, and message item", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onTextDelta("Hi");

		const events = state.onTextDone();

		expect(events).toEqual([
			expect.objectContaining({
				type: "response.output_text.done",
				output_index: 0,
				content_index: 0,
				text: "Hi",
			}),
			expect.objectContaining({
				type: "response.content_part.done",
				output_index: 0,
				content_index: 0,
				part: { type: "output_text", text: "Hi" },
			}),
			expect.objectContaining({
				type: "response.output_item.done",
				output_index: 0,
				item: expect.objectContaining({
					type: "message",
					status: "completed",
					content: [{ type: "output_text", text: "Hi" }],
				}),
			}),
		]);
		expect(state.snapshot.output[0]).toMatchObject({
			type: "message",
			status: "completed",
		});
	});

	test("text after text done opens a new output item", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onTextDelta("first");
		state.onTextDone();

		const events = state.onTextDelta("second");

		expect(events[0]).toMatchObject({
			type: "response.output_item.added",
			output_index: 1,
			item: { id: "msg_resp_test_1" },
		});
		expect(state.snapshot.output_text).toBe("firstsecond");
	});

	test("refusal uses refusal content part and done payload", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		const deltaEvents = state.onRefusalDelta("No");
		const doneEvents = state.onRefusalDone();

		expect(deltaEvents).toContainEqual(
			expect.objectContaining({
				type: "response.refusal.delta",
				output_index: 0,
				content_index: 0,
				delta: "No",
			}),
		);
		expect(doneEvents).toContainEqual(
			expect.objectContaining({
				type: "response.refusal.done",
				output_index: 0,
				content_index: 0,
				refusal: "No",
			}),
		);
	});

	test("reasoning emits reasoning item, part, delta, and done events", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		const deltaEvents = state.onReasoningTextDelta("think");
		const doneEvents = state.onReasoningTextDone();

		expect(deltaEvents).toEqual([
			expect.objectContaining({
				type: "response.output_item.added",
				output_index: 0,
				item: expect.objectContaining({
					id: "rs_resp_test_0",
					type: "reasoning",
					status: "in_progress",
				}),
			}),
			expect.objectContaining({
				type: "response.reasoning_text_part.added",
				output_index: 0,
				content_index: 0,
				part: { type: "reasoning_text", text: "" },
			}),
			expect.objectContaining({
				type: "response.reasoning_text.delta",
				output_index: 0,
				content_index: 0,
				delta: "think",
			}),
		]);
		expect(doneEvents).toContainEqual(
			expect.objectContaining({
				type: "response.reasoning_text.done",
				output_index: 0,
				content_index: 0,
				text: "think",
			}),
		);
	});

	test("done without an active output block throws", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		expect(() => state.onTextDone()).toThrow(GodeXError);
		expect(() => state.onRefusalDone()).toThrow(GodeXError);
		expect(() => state.onReasoningTextDone()).toThrow(GodeXError);
	});
});

describe("StreamResponseState tool calls", () => {
	test("arguments before name are replayed when call opens", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		expect(state.onFunctionCallDelta({ index: 0, arguments: '{"a"' })).toEqual([]);
		const events = state.onFunctionCallDelta({
			index: 0,
			id: "call_1",
			name: "tool",
			arguments: ':1}',
		});

		expect(events).toEqual([
			expect.objectContaining({
				type: "response.output_item.added",
				output_index: 0,
				item_id: "call_1",
				item: {
					type: "function_call",
					call_id: "call_1",
					name: "tool",
					arguments: "",
				},
			}),
			expect.objectContaining({
				type: "response.function_call_arguments.delta",
				item_id: "call_1",
				output_index: 0,
				delta: '{"a":1}',
			}),
		]);
	});

	test("function call done requires explicit index and closes mapped item", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFunctionCallDelta({
			index: 0,
			id: "call_1",
			name: "tool",
			arguments: "{}",
		});

		const events = state.onFunctionCallDone(0);

		expect(events).toEqual([
			expect.objectContaining({
				type: "response.function_call_arguments.done",
				item_id: "call_1",
				output_index: 0,
				text: "{}",
			}),
			expect.objectContaining({
				type: "response.output_item.done",
				output_index: 0,
				item: {
					type: "function_call",
					call_id: "call_1",
					name: "tool",
					arguments: "{}",
				},
			}),
		]);
		expect(state.snapshot.output[0]).toEqual({
			type: "function_call",
			call_id: "call_1",
			name: "tool",
			arguments: "{}",
		});
	});

	test("multiple function calls keep output order by arrival", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFunctionCallDelta({ index: 1, id: "call_b", name: "second" });
		state.onFunctionCallDelta({ index: 0, id: "call_a", name: "first" });

		// output order = arrival order, not tool call index
		expect(state.snapshot.output).toEqual([
			expect.objectContaining({ call_id: "call_b" }),
			expect.objectContaining({ call_id: "call_a" }),
		]);
	});

	test("function call done before name throws", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFunctionCallDelta({ index: 0, arguments: "{}" });

		expect(() => state.onFunctionCallDone(0)).toThrow(GodeXError);
	});

	test("function call without name emits nothing", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		expect(state.onFunctionCallDelta({ index: 0, id: "call_1", arguments: "x" })).toEqual([]);
		expect(state.onFunctionCallDelta({ index: 0, arguments: "y" })).toEqual([]);
	});
});
