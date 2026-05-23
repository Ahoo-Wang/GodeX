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
		createdAt: 1,
		resolved: { provider: "zhipu", model: "glm-4" },
		logger,
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

describe("TraceTransformer", () => {
	test("logs each event with the given event name", async () => {
		const traces: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const logger: Logger = {
			level: "trace",
			child: () => logger,
			trace: (event, attr) => {
				traces.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};
		const ctx = createTestContext(logger);

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

		await drain(pipeTransform(stream, new TraceTransformer("test.event", ctx)));

		expect(traces).toHaveLength(2);
		expect(traces[0]?.event).toBe("test.event");
		expect(traces[0]?.attr).toMatchObject({ data: events[0] });
		expect(traces[1]?.event).toBe("test.event");
		expect(traces[1]?.attr).toMatchObject({ data: events[1] });
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
			pipeTransform(stream, new TraceTransformer("test.event", ctx)),
		);

		expect(output).toEqual(events);
	});
});
