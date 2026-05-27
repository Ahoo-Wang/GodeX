import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import type { CompatibilityDiagnostic } from "./compatibility";
import type { Provider } from "./provider";
import type { ProviderStreamExchangeResult } from "./provider-exchange";
import { StreamPipeline } from "./stream-pipeline";
import { ATTR_UPSTREAM_LATENCY_MILLIS } from "./transformers/stream-utils";

function createMockSessionStore(): ResponseSessionStore & {
	saved: StoredResponseSession[];
} {
	const saved: StoredResponseSession[] = [];
	return {
		saved,
		get: async () => null,
		save: async (session: StoredResponseSession) => {
			saved.push(session);
		},
		resolveChain: async () =>
			({
				previous_response_id: "none",
				turns: [],
				input_items: [],
			}) as never,
		delete: async () => {},
	};
}

function createResponseObject(id = "resp_stream"): ResponseObject {
	return {
		id,
		object: "response",
		status: "completed",
		model: "test",
		created_at: 1,
		completed_at: 2,
		output: [],
		output_text: "",
		usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
	};
}

function createMockProvider(
	streamEvents: ResponseStreamEvent[],
): Provider<unknown, unknown, unknown> {
	return {
		name: "mock",
		mapper: {
			request: { map: () => ({ model: "test" }) },
			response: { map: () => createResponseObject() },
			stream: { map: () => streamEvents },
		},
		client: {
			request: async () => ({}),
			stream: async () => new ReadableStream(),
		},
	};
}

function createMockCtx(
	provider: Provider<unknown, unknown, unknown>,
	store = true,
	loggerOverrides: Partial<ResponsesContext["logger"]> = {},
): ResponsesContext & { traceEvents: unknown[] } {
	const logger: ResponsesContext["logger"] = {
		info: () => {},
		debug: () => {},
		trace: () => {},
		error: () => {},
		warn: () => {},
		...loggerOverrides,
	} as ResponsesContext["logger"];
	const traceEvents: unknown[] = [];

	return {
		provider,
		app: {
			sessionStore: createMockSessionStore(),
			traceEnabled: true,
			traceRecorder: {
				record: (event: unknown) => {
					traceEvents.push(event);
				},
			},
		},
		logger,
		request: { model: "mock/test", input: "hello", store },
		requestId: "req_test",
		responseId: "resp_stream",
		createdAt: Math.floor(Date.now() / 1000),
		resolved: { provider: "mock", model: "test" },
		diagnostics: [],
		addDiagnostic(diagnostic: CompatibilityDiagnostic) {
			(
				this as unknown as { diagnostics: CompatibilityDiagnostic[] }
			).diagnostics.push(diagnostic);
		},
		attributes: new Map(),
		session: null,
		traceEvents,
	} as unknown as ResponsesContext & { traceEvents: unknown[] };
}

function createStream(
	events: JsonServerSentEvent<unknown>[],
): ReadableStream<JsonServerSentEvent<unknown>> {
	return new ReadableStream({
		start(controller) {
			for (const event of events) {
				controller.enqueue(event);
			}
			controller.close();
		},
	});
}

function createErrorAfterFirstChunkStream(): ReadableStream<
	JsonServerSentEvent<unknown>
> {
	let sentFirst = false;
	return new ReadableStream({
		pull(controller) {
			if (sentFirst) {
				controller.error(new Error("upstream failed after terminal event"));
				return;
			}
			sentFirst = true;
			controller.enqueue({ event: "chunk", data: { text: "done" } });
		},
	});
}

function createFailingStream(): ReadableStream<JsonServerSentEvent<unknown>> {
	return new ReadableStream({
		start(controller) {
			controller.error(new Error("upstream stream failed"));
		},
	});
}

function createExchange(
	providerStream: ReadableStream<JsonServerSentEvent<unknown>>,
	upstreamLatencyMillis = 17,
) {
	return {
		stream: async (
			ctx: ResponsesContext,
		): Promise<ProviderStreamExchangeResult> => ({
			mapper: ctx.provider.mapper,
			providerStream,
			upstreamLatencyMillis,
		}),
	};
}

async function readStream<T>(stream: ReadableStream<T>): Promise<T[]> {
	const reader = stream.getReader();
	const chunks: T[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return chunks;
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
}

function traceEventNames(ctx: { traceEvents: unknown[] }): string[] {
	return ctx.traceEvents
		.filter((event) => (event as { kind?: string }).kind === "event")
		.map((event) => (event as { event_name: string }).event_name);
}

describe("StreamPipeline", () => {
	test("builds the stream chain, records traces, logs completion, and saves terminal response", async () => {
		const responseObject = createResponseObject();
		const streamEvents: ResponseStreamEvent[] = [
			{ type: "response.completed", response: responseObject },
		];
		const provider = createMockProvider(streamEvents);
		const infoLogs: Array<{ event: string; attr: Record<string, unknown> }> =
			[];
		const ctx = createMockCtx(provider, true, {
			info: (event, attr) => {
				infoLogs.push({
					event,
					attr: typeof attr === "function" ? attr() : (attr ?? {}),
				});
			},
		});
		const saved: ResponseObject[] = [];
		const pipeline = new StreamPipeline(
			createExchange(
				createStream([{ event: "chunk", data: { text: "done" } }]),
			),
			async (_store, response) => {
				saved.push(response);
			},
		);

		const events = await readStream(await pipeline.stream(ctx));

		expect(events).toEqual(streamEvents);
		expect(ctx.attributes.get(ATTR_UPSTREAM_LATENCY_MILLIS)).toBe(17);
		expect(traceEventNames(ctx)).toEqual([
			"upstream.stream.event.raw",
			"upstream.stream.event.transformed",
		]);
		expect(saved).toEqual([responseObject]);
		expect(infoLogs).toEqual([
			{
				event: "responses.stream.completed",
				attr: expect.objectContaining({
					status: "completed",
					model: "test",
					outputCount: 0,
					usage: responseObject.usage,
					upstreamLatencyMillis: 17,
					streamEventCount: 1,
				}) as Record<string, unknown>,
			},
		]);
	});

	test("skips session persistence when response storage is disabled", async () => {
		const responseObject = createResponseObject("resp_no_store");
		const provider = createMockProvider([
			{ type: "response.completed", response: responseObject },
		]);
		const ctx = createMockCtx(provider, false);
		let saveCalls = 0;
		const pipeline = new StreamPipeline(
			createExchange(createStream([{ event: "chunk", data: {} }])),
			async () => {
				saveCalls++;
			},
		);

		await readStream(await pipeline.stream(ctx));

		expect(saveCalls).toBe(0);
	});

	test("closes cleanly when provider stream errors before any chunk", async () => {
		const provider = createMockProvider([]);
		const ctx = createMockCtx(provider);
		const events = await readStream(
			await new StreamPipeline(createExchange(createFailingStream())).stream(
				ctx,
			),
		);

		expect(events).toEqual([]);
	});

	test("persists terminal response before a subsequent upstream read error", async () => {
		const responseObject = createResponseObject("resp_before_error");
		const provider = createMockProvider([
			{ type: "response.completed", response: responseObject },
		]);
		const ctx = createMockCtx(provider);
		const saved: ResponseObject[] = [];
		const events = await readStream(
			await new StreamPipeline(
				createExchange(createErrorAfterFirstChunkStream()),
				async (_store, response) => {
					saved.push(response);
				},
			).stream(ctx),
		);

		expect(events).toEqual([
			expect.objectContaining({ type: "response.completed" }),
		]);
		expect(saved).toEqual([responseObject]);
	});
});
