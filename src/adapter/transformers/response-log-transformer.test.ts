import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../context/responses-context";
import type { Logger } from "../../logger";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai";
import { StreamResponseState } from "../mapper/chat/stream-response-state";
import { ResponseLogTransformer } from "./response-log-transformer";
import { pipeTransform } from "./stream-utils";

async function drain<T>(stream: ReadableStream<T>): Promise<T[]> {
	const reader = stream.getReader();
	const values: T[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return values;
			values.push(value);
		}
	} finally {
		reader.releaseLock();
	}
}

function createTestContext(logger: Logger): ResponsesContext {
	return {
		responseId: "resp_test",
		createdAt: 1,
		resolved: { provider: "zhipu", model: "glm-4" },
		logger,
		attributes: new Map(),
		request: {},
	} as unknown as ResponsesContext;
}

function terminalEvent(
	status: ResponseObject["status"] = "completed",
): ResponseStreamEvent {
	return {
		type: "response.completed",
		response: {
			id: "resp_1",
			object: "response",
			created_at: 1,
			status,
			model: "glm-4",
			output: [{ type: "message", role: "assistant", content: [] }],
			usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
		} as ResponseObject,
	};
}

function toolCallMapper(call: { id: string; name: string; arguments: string }) {
	return {
		type: "function_call" as const,
		id: call.id,
		call_id: call.id,
		name: call.name,
		arguments: call.arguments,
	};
}

describe("ResponseLogTransformer", () => {
	test("logs completion on terminal event with correct fields", async () => {
		const infos: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: (event, attr) => {
				infos.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);

		const event = terminalEvent();
		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue(event);
				controller.close();
			},
		});

		await drain(pipeTransform(stream, new ResponseLogTransformer(ctx)));

		expect(infos).toHaveLength(1);
		expect(infos[0]?.event).toBe("responses.stream.completed");
		expect(infos[0]?.attr).toMatchObject({
			status: "completed",
			model: "glm-4",
			outputCount: 1,
			streamEventCount: 1,
			usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
		});
	});

	test("counts all events and logs only once", async () => {
		const infos: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: (event, attr) => {
				infos.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);

		const event1: ResponseStreamEvent = {
			type: "response.output_item.added",
			output_index: 0,
		} as ResponseStreamEvent;
		const event2: ResponseStreamEvent = {
			type: "response.output_text.delta",
			output_index: 0,
			content_index: 0,
			delta: "hi",
		} as ResponseStreamEvent;
		const event3 = terminalEvent();

		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue(event1);
				controller.enqueue(event2);
				controller.enqueue(event3);
				controller.close();
			},
		});

		await drain(pipeTransform(stream, new ResponseLogTransformer(ctx)));

		expect(infos).toHaveLength(1);
		expect(infos[0]?.attr).toMatchObject({ streamEventCount: 3 });
	});

	test("passes through all events unchanged", async () => {
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);

		const events: ResponseStreamEvent[] = [
			{ type: "response.output_text.delta", delta: "a" } as ResponseStreamEvent,
			terminalEvent(),
		];

		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				for (const e of events) controller.enqueue(e);
				controller.close();
			},
		});

		const output = await drain(
			pipeTransform(stream, new ResponseLogTransformer(ctx)),
		);

		expect(output).toEqual(events);
	});

	test("logs via onFlush when stream ends without terminal event but state is terminal", async () => {
		const infos: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: (event, attr) => {
				infos.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);
		const state = StreamResponseState.create(ctx, {
			toolCallOutputItemMapper: toolCallMapper,
		});
		state.start();
		state.onFinish({ status: "completed" });

		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue({
					type: "response.output_text.delta",
					delta: "x",
				} as ResponseStreamEvent);
				controller.close();
			},
		});

		await drain(pipeTransform(stream, new ResponseLogTransformer(ctx)));

		expect(infos).toHaveLength(1);
		expect(infos[0]?.event).toBe("responses.stream.completed");
		expect(infos[0]?.attr).toMatchObject({
			status: "completed",
			outputCount: 0,
			streamEventCount: 1,
		});
	});

	test("does not log when stream ends without terminal event and phase is not terminal", async () => {
		const infos: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: (event, attr) => {
				infos.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);
		StreamResponseState.create(ctx, {
			toolCallOutputItemMapper: toolCallMapper,
		}).start();

		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue({
					type: "response.output_text.delta",
					delta: "x",
				} as ResponseStreamEvent);
				controller.close();
			},
		});

		await drain(pipeTransform(stream, new ResponseLogTransformer(ctx)));

		expect(infos).toHaveLength(0);
	});

	test("includes upstreamLatencyMillis from ctx.attributes", async () => {
		const infos: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: (event, attr) => {
				infos.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);
		ctx.attributes.set("upstreamLatencyMillis", 42);

		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue(terminalEvent());
				controller.close();
			},
		});

		await drain(pipeTransform(stream, new ResponseLogTransformer(ctx)));

		expect(infos[0]?.attr).toMatchObject({
			upstreamLatencyMillis: 42,
		});
	});
});
