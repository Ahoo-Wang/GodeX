import { describe, expect, test } from "bun:test";
import {
	BRIDGE_STREAM_DELTA_AFTER_TERMINAL,
	BRIDGE_STREAM_OUTPUT_BEFORE_START,
	BridgeError,
} from "../../error";
import type { ResponseUsage } from "../../protocol/openai/responses";
import {
	ResponseStreamPhase,
	ResponseStreamStateMachine,
} from "./response-stream-state-machine";

const usage: ResponseUsage = {
	input_tokens: 3,
	output_tokens: 5,
	total_tokens: 8,
};

function machine(): ResponseStreamStateMachine {
	return new ResponseStreamStateMachine({
		responseId: "resp_test",
		createdAt: 1_764_000_000,
		model: "resolved-model",
		provider: "deepseek",
		nowSeconds: () => 1_764_000_010,
	});
}

describe("ResponseStreamStateMachine", () => {
	test("emits baseline text stream ordering", () => {
		const state = machine();

		const events = [
			...state.start(),
			...state.text("Hello"),
			...state.finish("stop"),
		];

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		]);
		expect(events.at(-1)?.response).toMatchObject({
			id: "resp_test",
			status: "completed",
			output_text: "Hello",
			output: [
				{
					id: "msg_resp_test_0",
					type: "message",
					role: "assistant",
					status: "completed",
					content: [{ type: "output_text", text: "Hello" }],
				},
			],
			error: null,
			incomplete_details: null,
			usage: null,
		});
	});

	test("rejects delta before start with BridgeError", () => {
		expect(() => machine().text("early")).toThrow(BridgeError);

		try {
			machine().text("early");
		} catch (err) {
			expect(err).toBeInstanceOf(BridgeError);
			expect((err as BridgeError).code).toBe(BRIDGE_STREAM_OUTPUT_BEFORE_START);
		}
	});

	test("rejects fail before start with BridgeError", () => {
		const state = machine();

		expect(() =>
			state.fail({ code: "provider_error", message: "early failure" }),
		).toThrow(BridgeError);
		expect(state.snapshot.status).toBe("queued");

		try {
			state.fail({ code: "provider_error", message: "early failure" });
		} catch (err) {
			expect(err).toBeInstanceOf(BridgeError);
			expect((err as BridgeError).code).toBe(BRIDGE_STREAM_OUTPUT_BEFORE_START);
		}
	});

	test("rejects deltas after terminal", () => {
		const state = machine();
		state.start();
		state.finish("stop");

		expect(() => state.text("late")).toThrow(BridgeError);

		try {
			state.text("late");
		} catch (err) {
			expect(err).toBeInstanceOf(BridgeError);
			expect((err as BridgeError).code).toBe(
				BRIDGE_STREAM_DELTA_AFTER_TERMINAL,
			);
		}
	});

	test("maps length finish to incomplete max_output_tokens", () => {
		const state = machine();
		const events = [
			...state.start(),
			...state.text("partial"),
			...state.finish("length"),
		];
		const terminal = events.at(-1);

		expect(terminal?.type).toBe("response.incomplete");
		expect(terminal?.response).toMatchObject({
			status: "incomplete",
			incomplete_details: { reason: "max_output_tokens" },
			error: null,
		});
	});

	test("maps provider error to failed terminal response", () => {
		const state = machine();
		const events = [
			...state.start(),
			...state.text("before"),
			...state.fail({ code: "provider_error", message: "upstream failed" }),
		];

		expect(state.phase).toBe(ResponseStreamPhase.FAILED);
		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.failed",
		]);
		expect(events.at(-1)?.response).toMatchObject({
			status: "failed",
			error: { code: "server_error", message: "upstream failed" },
		});
		expect(() => state.text("late")).toThrow(BridgeError);
	});

	test("keeps allowed response error codes on failed terminal response", () => {
		const state = machine();
		const events = [
			...state.start(),
			...state.fail({
				code: "rate_limit_exceeded",
				message: "slow down",
			}),
		];

		expect(events.at(-1)?.response?.error).toEqual({
			code: "rate_limit_exceeded",
			message: "slow down",
		});
	});

	test("empty text delta is no-op without opening output blocks", () => {
		const state = machine();
		const events = [
			...state.start(),
			...state.text(""),
			...state.finish("stop"),
		];

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.completed",
		]);
		expect(events.at(-1)?.response?.output).toEqual([]);
		expect(events.at(-1)?.response?.output_text).toBe("");
	});

	test("usage delta is included on terminal response", () => {
		const state = machine();
		const events = [
			...state.start(),
			...state.text("Hello"),
			...state.usage(usage),
			...state.finish("stop"),
		];

		expect(events.at(-1)?.response?.usage).toEqual(usage);
	});

	test("reasoning deltas are emitted and closed before terminal response", () => {
		const state = machine();
		const events = [
			...state.start(),
			...state.reasoning("think"),
			...state.text("answer"),
			...state.finish("stop"),
		];

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.reasoning_text_part.added",
			"response.reasoning_text.delta",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.reasoning_text.done",
			"response.reasoning_text_part.done",
			"response.output_item.done",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		]);
		expect(events.at(-1)?.response?.output).toEqual([
			expect.objectContaining({
				type: "reasoning",
				status: "completed",
				content: [{ type: "reasoning_text", text: "think" }],
			}),
			expect.objectContaining({ type: "message", status: "completed" }),
		]);
	});
});
