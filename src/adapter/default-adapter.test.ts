import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import { DefaultAdapter } from "./default-adapter";
import type { Provider } from "./provider";

function createResponseObject(id = "resp_123"): ResponseObject {
	return {
		id,
		object: "response",
		status: "completed",
		model: "test",
		created_at: 1,
		completed_at: 2,
		output: [],
		output_text: "",
		usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
	};
}

function createMockProvider(
	responseObject: ResponseObject,
	streamEvents: ResponseStreamEvent[] = [],
	providerStreamEvents: JsonServerSentEvent<unknown>[] = [],
): Provider<unknown, unknown, unknown> {
	return {
		name: "mock",
		mapper: {
			request: { map: () => ({ model: "test" }) },
			response: {
				map: () => responseObject,
			},
			stream: {
				map: () => streamEvents,
			},
		},
		client: {
			request: async () => responseObject,
			stream: async () =>
				new ReadableStream({
					start(controller) {
						for (const event of providerStreamEvents) {
							controller.enqueue(event);
						}
						controller.close();
					},
				}),
		},
	};
}

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

function createMockCtx(
	provider: Provider<unknown, unknown, unknown>,
	sessionStore: ResponseSessionStore,
): ResponsesContext {
	return {
		provider,
		app: {
			sessionStore,
			traceEnabled: true,
			traceRecorder: { record: () => {} },
		},
		logger: {
			info: () => {},
			debug: () => {},
			trace: () => {},
			error: () => {},
			warn: () => {},
		},
		request: { model: "mock/test", input: "hello", store: true },
		requestId: "req_test",
		responseId: "resp_123",
		createdAt: Math.floor(Date.now() / 1000),
		resolved: { provider: "test", model: "test" },
		diagnostics: [],
		addDiagnostic() {},
		attributes: new Map(),
		session: null,
	} as unknown as ResponsesContext;
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

describe("DefaultAdapter", () => {
	test("default construction wires a working sync pipeline", async () => {
		const responseObject = createResponseObject("resp_sync");
		const provider = createMockProvider(responseObject);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const result = await new DefaultAdapter().request(ctx);

		expect(result).toBe(responseObject);
		expect(sessionStore.saved[0]?.id).toBe("resp_sync");
	});

	test("default construction wires a working stream pipeline", async () => {
		const responseObject = createResponseObject("resp_stream");
		const provider = createMockProvider(
			responseObject,
			[{ type: "response.completed", response: responseObject }],
			[{ event: "chunk", data: {} }],
		);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const events = await readStream(await new DefaultAdapter().stream(ctx));

		expect(events).toEqual([
			{ type: "response.completed", response: responseObject },
		]);
		expect(sessionStore.saved[0]?.id).toBe("resp_stream");
	});

	test("delegates request and stream to injected pipelines", async () => {
		const ctx = {} as ResponsesContext;
		const responseObject = createResponseObject("resp_injected");
		const stream = new ReadableStream<ResponseStreamEvent>();
		const calls: Array<{ pipeline: string; ctx: ResponsesContext }> = [];
		const adapter = new DefaultAdapter(
			{
				request: async (receivedCtx) => {
					calls.push({ pipeline: "sync", ctx: receivedCtx });
					return responseObject;
				},
			},
			{
				stream: async (receivedCtx) => {
					calls.push({ pipeline: "stream", ctx: receivedCtx });
					return stream;
				},
			},
		);

		const responseResult = await adapter.request(ctx);
		const streamResult = await adapter.stream(ctx);

		expect(responseResult).toBe(responseObject);
		expect(streamResult).toBe(stream);
		expect(calls).toEqual([
			{ pipeline: "sync", ctx },
			{ pipeline: "stream", ctx },
		]);
	});
});
