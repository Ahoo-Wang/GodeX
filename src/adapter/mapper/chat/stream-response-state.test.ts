import { describe, expect, test } from "bun:test";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { GodeXError } from "../../../error";
import { createLogger } from "../../../logger";
import type { ResponseItem } from "../../../protocol/openai/responses";
import {
	StreamResponsePhase,
	StreamResponseState,
	type StreamResponseTerminalStatus,
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

		expect(state.onFunctionCallDelta({ index: 0, arguments: '{"a"' })).toEqual(
			[],
		);
		const events = state.onFunctionCallDelta({
			index: 0,
			id: "call_1",
			name: "tool",
			arguments: ":1}",
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
					status: "in_progress",
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
					status: "completed",
				},
			}),
		]);
		expect(state.snapshot.output[0]).toEqual({
			type: "function_call",
			call_id: "call_1",
			name: "tool",
			arguments: "{}",
			status: "completed",
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

		expect(
			state.onFunctionCallDelta({ index: 0, id: "call_1", arguments: "x" }),
		).toEqual([]);
		expect(state.onFunctionCallDelta({ index: 0, arguments: "y" })).toEqual([]);
	});
});

describe("StreamResponseState terminal behavior", () => {
	test("finish closes open outputs before completed event", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
			nowSeconds: () => 1_764_000_010,
		});
		state.start();
		state.onReasoningTextDelta("think");
		state.onTextDelta("answer");
		state.onFunctionCallDelta({
			index: 0,
			id: "call_1",
			name: "tool",
			arguments: "{}",
		});

		const events = state.onFinish({ status: "completed" });

		// Events must close all open blocks in output order, then terminal
		expect(events.map((event) => event.type)).toEqual([
			"response.reasoning_text.done",
			"response.reasoning_text_part.done",
			"response.output_item.done",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.function_call_arguments.done",
			"response.output_item.done",
			"response.completed",
		]);
		expect(state.snapshot).toMatchObject({
			status: "completed",
			completed_at: 1_764_000_010,
			output: [
				expect.objectContaining({ type: "reasoning", status: "completed" }),
				expect.objectContaining({ type: "message", status: "completed" }),
				expect.objectContaining({ type: "function_call" }),
			],
		});
	});

	test("onError from IDLE emits failed terminal response", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
			nowSeconds: () => 1_764_000_010,
		});
		// NOTE: state is IDLE, start() was never called

		const events = state.onError({
			code: "server_error",
			message: "upstream connection failed before stream started",
		});

		expect(state.phase).toBe(StreamResponsePhase.FAILED);
		expect(events).toEqual([
			expect.objectContaining({
				type: "response.failed",
				response: expect.objectContaining({
					status: "failed",
					error: {
						code: "server_error",
						message: "upstream connection failed before stream started",
					},
				}),
			}),
		]);
	});

	test("onError from IN_PROGRESS closes active blocks before failed event", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
			nowSeconds: () => 1_764_000_010,
		});
		state.start();
		state.onTextDelta("partial answer");

		const events = state.onError({
			code: "server_error",
			message: "upstream stream failed",
		});

		expect(state.phase).toBe(StreamResponsePhase.FAILED);
		// Must close text block before failed
		expect(events.map((e) => e.type)).toEqual([
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.failed",
		]);
		expect(events[events.length - 1]).toEqual(
			expect.objectContaining({
				type: "response.failed",
				response: expect.objectContaining({
					status: "failed",
					output: [
						expect.objectContaining({ type: "message", status: "completed" }),
					],
					error: {
						code: "server_error",
						message: "upstream stream failed",
					},
				}),
			}),
		);
	});

	test("delta after terminal throws", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFinish({ status: "completed" });

		expect(() => state.onTextDelta("late")).toThrow(GodeXError);
	});

	test("invalid terminal status throws instead of corrupting phase", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onTextDelta("partial");

		expect(() =>
			state.onFinish({
				status: "queued",
			} as unknown as StreamResponseTerminalStatus),
		).toThrow(GodeXError);
		expect(state.phase).toBe(StreamResponsePhase.IN_PROGRESS);
		expect(state.snapshot.output[0]).toMatchObject({
			type: "message",
			status: "in_progress",
		});
		expect(() => state.onTextDone()).not.toThrow();
	});

	test("delta before start throws with specific error code", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		// state is IDLE, start() was never called

		expect(() => state.onTextDelta("early")).toThrow(GodeXError);
	});

	test("streaming usage is not set by finish", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFinish({ status: "completed" });

		expect(state.snapshot.usage).toBeUndefined();
	});

	test("repeated finish throws", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFinish({ status: "completed" });

		expect(() => state.onFinish({ status: "completed" })).toThrow(GodeXError);
	});

	test("empty deltas no-op without opening blocks", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();

		expect(state.onTextDelta("")).toEqual([]);
		expect(state.onRefusalDelta("")).toEqual([]);
		expect(state.onReasoningTextDelta("")).toEqual([]);
		// Verify no blocks were opened
		expect(state.snapshot.output).toEqual([]);
	});

	test("tool call delta after done throws", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFunctionCallDelta({
			index: 0,
			id: "c1",
			name: "t1",
			arguments: "{}",
		});
		state.onFunctionCallDone(0);

		expect(() =>
			state.onFunctionCallDelta({ index: 0, arguments: "x" }),
		).toThrow(GodeXError);
	});

	test("duplicate tool call done throws", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		state.onFunctionCallDelta({
			index: 0,
			id: "c1",
			name: "t1",
			arguments: "{}",
		});
		state.onFunctionCallDone(0);

		expect(() => state.onFunctionCallDone(0)).toThrow(GodeXError);
	});

	test("finish closes blocks sorted by output_index not type", () => {
		const state = StreamResponseState.create(ctx(), {
			toolCallOutputItemMapper: toolMapper,
		});
		state.start();
		// Open text first (output_index=0), then reasoning (output_index=1)
		state.onTextDelta("answer");
		state.onReasoningTextDelta("think");

		const events = state.onFinish({ status: "completed" });

		// text (output 0) must close before reasoning (output 1)
		expect(events.map((e) => e.type)).toEqual([
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.reasoning_text.done",
			"response.reasoning_text_part.done",
			"response.output_item.done",
			"response.completed",
		]);
	});
});
