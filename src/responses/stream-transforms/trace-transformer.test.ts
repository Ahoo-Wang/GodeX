import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../context/responses-context";
import type { Logger } from "../../logger";
import { pipeTransform } from "./stream-utils";
import { TraceTransformer } from "./trace-transformer";

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
		requestId: "req_test",
		responseId: "resp_test",
		createdAt: 1,
		resolved: { provider: "zhipu", model: "glm-4" },
		logger,
		attributes: new Map(),
		app: {
			traceRecorder: { record: () => {} },
			traceEnabled: true,
		},
	} as unknown as ResponsesContext;
}

describe("TraceTransformer", () => {
	test("records each event through trace recorder with the given event name", async () => {
		const records: unknown[] = [];
		const logger: Logger = {
			level: "trace",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};
		const ctx = {
			...createTestContext(logger),
			requestId: "req_trace",
			responseId: "resp_trace",
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => records.push(event) },
			},
		} as unknown as ResponsesContext;
		const events = [
			{ type: "response.output_text.delta", delta: "hello" },
			{ type: "response.output_text.delta", delta: " world" },
		];
		const stream = new ReadableStream({
			start(controller) {
				for (const e of events) controller.enqueue(e);
				controller.close();
			},
		});
		await drain(
			pipeTransform(
				stream,
				new TraceTransformer("upstream.stream.event.raw", ctx),
			),
		);
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			kind: "event",
			event_name: "upstream.stream.event.raw",
			request_id: "req_trace",
		});
	});

	test("passes through all events unchanged", async () => {
		const logger: Logger = {
			level: "trace",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);

		const events = [
			{ type: "a", data: 1 },
			{ type: "b", data: 2 },
		];

		const stream = new ReadableStream({
			start(controller) {
				for (const e of events) controller.enqueue(e);
				controller.close();
			},
		});

		const output = await drain(
			pipeTransform(
				stream,
				new TraceTransformer("upstream.stream.event.transformed", ctx),
			),
		);

		expect(output).toEqual(events);
	});
});
