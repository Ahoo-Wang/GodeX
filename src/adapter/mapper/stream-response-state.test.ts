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
