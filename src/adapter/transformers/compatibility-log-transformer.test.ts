import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../context/responses-context";
import type { Logger } from "../../logger";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import { CompatibilityLogTransformer } from "./compatibility-log-transformer";

function mockCtx(diagnostics: unknown[] = []): {
	ctx: ResponsesContext;
	logCalls: Array<{
		level: string;
		event: string;
		attr: Record<string, unknown>;
	}>;
} {
	const logCalls: Array<{
		level: string;
		event: string;
		attr: Record<string, unknown>;
	}> = [];

	function mkLog(level: string) {
		return (_event: string, attr?: unknown) => {
			let resolved: Record<string, unknown> = {};
			if (typeof attr === "function") {
				resolved = (attr as () => Record<string, unknown>)();
			} else if (attr !== undefined) {
				resolved = attr as Record<string, unknown>;
			}
			logCalls.push({
				level,
				event: _event,
				attr: resolved,
			});
		};
	}

	return {
		ctx: {
			diagnostics,
			requestId: "req_x",
			responseId: "resp_x",
			createdAt: Math.floor(Date.now() / 1000),
			logger: {
				info: mkLog("info"),
				warn: mkLog("warn"),
				error: mkLog("error"),
			} as unknown as Logger,
		} as unknown as ResponsesContext,
		logCalls,
	};
}

async function runTransformer(
	transformer: CompatibilityLogTransformer,
	events: ResponseStreamEvent[],
): Promise<ResponseStreamEvent[]> {
	const input = new ReadableStream<ResponseStreamEvent>({
		start(controller) {
			for (const e of events) {
				controller.enqueue(e);
			}
			controller.close();
		},
	});
	const transformed = input.pipeThrough(new TransformStream(transformer));
	return readAll(transformed);
}

async function readAll<T>(stream: ReadableStream<T>): Promise<T[]> {
	const reader = stream.getReader();
	const results: T[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			results.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return results;
}

describe("CompatibilityLogTransformer", () => {
	test("logs diagnostics on response.completed terminal event", async () => {
		const { ctx, logCalls } = mockCtx([
			{
				code: "adapter.tool.unsupported",
				severity: "warn",
				action: "ignored",
				message: "Not supported",
			},
		]);

		const transformer = new CompatibilityLogTransformer(ctx);
		const results = await runTransformer(transformer, [
			{ type: "response.output_text.delta", delta: "hi" },
			{
				type: "response.completed",
				response: { id: "resp_1", object: "response" } as never,
			},
		]);

		expect(results.length).toBe(2);
		expect(logCalls.length).toBe(1);
		expect(logCalls[0]?.event).toBe("responses.diagnostics");
		expect(logCalls[0]?.level).toBe("warn");
		expect(logCalls[0]?.attr).toHaveProperty("durationMillis");
	});

	test("logs diagnostics on response.failed terminal event", async () => {
		const { ctx, logCalls } = mockCtx([
			{
				code: "adapter.param.unsupported",
				severity: "error",
				action: "rejected",
				message: "test",
			},
		]);

		const transformer = new CompatibilityLogTransformer(ctx);
		await runTransformer(transformer, [
			{
				type: "response.failed",
				response: { id: "resp_2", object: "response" } as never,
			},
		]);

		expect(logCalls.length).toBe(1);
		expect(logCalls[0]?.level).toBe("error");
	});

	test("logs diagnostics on response.cancelled terminal event", async () => {
		const { ctx, logCalls } = mockCtx([
			{
				code: "adapter.tool.unsupported",
				severity: "info",
				action: "ignored",
				message: "test",
			},
		]);

		const transformer = new CompatibilityLogTransformer(ctx);
		await runTransformer(transformer, [
			{
				type: "response.cancelled",
				response: { id: "resp_3", object: "response" } as never,
			},
		]);

		expect(logCalls.length).toBe(1);
		expect(logCalls[0]?.event).toBe("responses.diagnostics");
	});

	test("logs only once on multiple terminal events", async () => {
		const { ctx, logCalls } = mockCtx([
			{
				code: "adapter.tool.unsupported",
				severity: "warn",
				action: "ignored",
				message: "test",
			},
		]);

		const transformer = new CompatibilityLogTransformer(ctx);
		await runTransformer(transformer, [
			{ type: "response.completed", response: {} as never },
			{ type: "response.completed", response: {} as never },
		]);

		expect(logCalls.length).toBe(1);
	});

	test("does not log when diagnostics array is empty", async () => {
		const { ctx, logCalls } = mockCtx([]);

		const transformer = new CompatibilityLogTransformer(ctx);
		await runTransformer(transformer, [
			{
				type: "response.completed",
				response: { id: "resp_5", object: "response" } as never,
			},
		]);

		expect(logCalls.length).toBe(0);
	});

	test("logs on flush when no terminal event seen", async () => {
		const { ctx, logCalls } = mockCtx([
			{
				code: "adapter.tool.unsupported",
				severity: "warn",
				action: "ignored",
				message: "test",
			},
		]);

		const transformer = new CompatibilityLogTransformer(ctx);
		await runTransformer(transformer, [
			{ type: "response.output_text.delta", delta: "a" },
			{ type: "response.output_text.delta", delta: "b" },
		]);

		expect(logCalls.length).toBe(1);
		expect(logCalls[0]?.event).toBe("responses.diagnostics");
	});

	test("passes through all events unchanged", async () => {
		const { ctx } = mockCtx([]);
		const events: ResponseStreamEvent[] = [
			{ type: "response.output_text.delta", delta: "hello" },
			{
				type: "response.completed",
				response: { id: "resp_7", object: "response" } as never,
			},
		];

		const transformer = new CompatibilityLogTransformer(ctx);
		const results = await runTransformer(transformer, events);

		expect(results).toEqual(events);
	});
});
