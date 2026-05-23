import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import { DEFAULT_CAPABILITIES } from "./capabilities";
import { DefaultAdapter } from "./default-adapter";
import { StreamState } from "./mapper/stream-state";
import type { Provider } from "./provider";

function createMockProvider(
	providerRes: unknown,
	streamEvents: ResponseStreamEvent[] = [],
	providerStreamEvents: JsonServerSentEvent<unknown>[] = [],
): Provider<unknown, unknown, unknown> {
	return {
		name: "mock",
		capabilities: DEFAULT_CAPABILITIES,
		mapper: {
			request: { map: () => ({ model: "test" }) },
			response: {
				map: (_ctx: ResponsesContext, _res: unknown) => providerRes as never,
			},
			stream: {
				map: () => streamEvents as never[],
				buildResponseObject: () => providerRes as ResponseObject,
			},
		},
		chatClient: {
			chat: async () => providerRes,
			streamChat: async () =>
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
	store = true,
	loggerOverrides: Partial<ResponsesContext["logger"]> = {},
): ResponsesContext {
	const logger: ResponsesContext["logger"] = {
		info: () => {},
		debug: () => {},
		trace: () => {},
		error: () => {},
		warn: () => {},
		...loggerOverrides,
	} as ResponsesContext["logger"];

	return {
		provider,
		app: { sessionStore },
		logger,
		request: { store },
		requestId: "req_test",
		responseId: "resp_123",
		createdAt: Math.floor(Date.now() / 1000),
		resolved: { provider: "test", model: "test" },
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
	test("request maps, calls chatClient, maps response, saves session", async () => {
		const responseObject = {
			id: "resp_123",
			object: "response" as const,
			status: "completed" as const,
			model: "test",
			created_at: 1,
			completed_at: 1,
			output: [],
			output_text: "",
			usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
		};
		const provider = createMockProvider(responseObject);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const adapter = new DefaultAdapter();
		const result = await adapter.request(ctx);

		expect(result).toBe(responseObject);
		expect(sessionStore.saved.length).toBe(1);
		expect(sessionStore.saved[0]?.id).toBe("resp_123");
	});

	test("request skips session save when store is false", async () => {
		const responseObject = {
			id: "resp_456",
			object: "response" as const,
			status: "completed" as const,
			model: "test",
			created_at: 1,
			completed_at: 1,
			output: [],
			output_text: "",
			usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
		};
		const provider = createMockProvider(responseObject);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore, false);

		const adapter = new DefaultAdapter();
		await adapter.request(ctx);

		expect(sessionStore.saved.length).toBe(0);
	});

	test("request returns response and logs warning when session save fails", async () => {
		const responseObject = {
			id: "resp_save_failed",
			object: "response" as const,
			status: "completed" as const,
			model: "test",
			created_at: 1,
			completed_at: 1,
			output: [],
			output_text: "",
			usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
		};
		const provider = createMockProvider(responseObject);
		const sessionStore = createMockSessionStore();
		sessionStore.save = async () => {
			throw new Error("session write failed");
		};
		const warnings: Array<{ event: string; attr: Record<string, unknown> }> =
			[];
		const ctx = createMockCtx(provider, sessionStore, true, {
			warn: (event, attr) => {
				warnings.push({
					event,
					attr: typeof attr === "function" ? attr() : (attr ?? {}),
				});
			},
		});

		const adapter = new DefaultAdapter();
		const result = await adapter.request(ctx);

		expect(result).toBe(responseObject);
		expect(warnings).toEqual([
			{
				event: "session.save.error",
				attr: {
					request_id: "req_test",
					response_id: "resp_save_failed",
					error: "Error: session write failed",
				},
			},
		]);
	});

	test("stream returns awaited ReadableStream", async () => {
		const provider = createMockProvider({}, []);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const adapter = new DefaultAdapter();
		const result = await adapter.stream(ctx);

		expect(result).toBeInstanceOf(ReadableStream);
	});

	test("stream saves the terminal response after the stream is consumed", async () => {
		const responseObject: ResponseObject = {
			id: "resp_123",
			object: "response",
			status: "completed",
			model: "test",
			created_at: 1,
			completed_at: 2,
			output: [],
			output_text: "",
		};
		const provider = createMockProvider(
			responseObject,
			[{ type: "response.completed", response: responseObject }],
			[{ event: "chunk", data: {} }],
		);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const adapter = new DefaultAdapter();
		await readStream(await adapter.stream(ctx));

		expect(sessionStore.saved.length).toBe(1);
		expect(sessionStore.saved[0]?.id).toBe("resp_123");
	});

	test("stream can persist from the mapper final response builder", async () => {
		const responseObject: ResponseObject = {
			id: "resp_from_state",
			object: "response",
			status: "completed",
			model: "test",
			created_at: 1,
			completed_at: 2,
			output: [],
		};
		const provider = createMockProvider(
			responseObject,
			[],
			[{ event: "chunk", data: {} }],
		);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);
		provider.mapper.stream.map = (
			ctx: ResponsesContext,
		): ResponseStreamEvent[] => {
			const state = StreamState.from(ctx);
			state.completedAt = 2;
			state.finalStatus = { status: "completed" };
			return [{ type: "response.output_text.done", text: "done" }];
		};
		provider.mapper.stream.buildResponseObject = (
			_ctx: ResponsesContext,
			_state: StreamState,
		) => responseObject;

		const adapter = new DefaultAdapter();
		await readStream(await adapter.stream(ctx));

		expect(sessionStore.saved.length).toBe(1);
		expect(sessionStore.saved[0]?.id).toBe("resp_from_state");
	});

	test("request logs trace for responses request body, upstream request body, and upstream response body", async () => {
		const responseObject = {
			id: "resp_trace",
			object: "response" as const,
			status: "completed" as const,
			model: "test",
			created_at: 1,
			completed_at: 1,
			output: [],
			output_text: "",
			usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
		};
		const provider = createMockProvider(responseObject);
		const sessionStore = createMockSessionStore();

		const traces: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const ctx = createMockCtx(provider, sessionStore, true, {
			trace: (event, attr) => {
				traces.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
		});

		const adapter = new DefaultAdapter();
		await adapter.request(ctx);

		expect(traces).toEqual([
			{ event: "responses.request.body", attr: { body: ctx.request } },
			{ event: "upstream.request.body", attr: { body: { model: "test" } } },
			{ event: "upstream.response.body", attr: { body: responseObject } },
		]);
	});

	test("stream logs trace for responses request body, upstream request body, and stream events", async () => {
		const responseObject: ResponseObject = {
			id: "resp_stream_trace",
			object: "response",
			status: "completed",
			model: "test",
			created_at: 1,
			completed_at: 2,
			output: [],
			output_text: "",
		};
		const provider = createMockProvider(
			responseObject,
			[{ type: "response.completed", response: responseObject }],
			[{ event: "chunk", data: { text: "hi" } }],
		);
		const sessionStore = createMockSessionStore();

		const traces: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const ctx = createMockCtx(provider, sessionStore, true, {
			trace: (event, attr) => {
				traces.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
		});

		const adapter = new DefaultAdapter();
		await readStream(await adapter.stream(ctx));

		const eventNames = traces.map((t) => t.event);
		expect(eventNames).toEqual([
			"responses.request.body",
			"upstream.request.body",
			"upstream.stream.event.raw",
			"upstream.stream.event.transformed",
		]);

		expect(traces[0]?.attr).toMatchObject({ body: ctx.request });
		expect(traces[1]?.attr).toMatchObject({ body: { model: "test" } });
		expect(traces[2]?.attr).toMatchObject({
			data: { event: "chunk", data: { text: "hi" } },
		});
		expect(traces[3]?.attr).toMatchObject({
			data: { type: "response.completed", response: responseObject },
		});
	});

	test("stream propagates provider read errors", async () => {
		const upstreamError = new Error("upstream stream failed");
		const provider = createMockProvider({});
		provider.chatClient.streamChat = async () =>
			new ReadableStream({
				start(controller) {
					controller.error(upstreamError);
				},
			});
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const adapter = new DefaultAdapter();

		await expect(readStream(await adapter.stream(ctx))).rejects.toThrow(
			"upstream stream failed",
		);
		expect(sessionStore.saved.length).toBe(0);
	});

	test("stream persists terminal response before a later upstream read error", async () => {
		const responseObject: ResponseObject = {
			id: "resp_terminal_before_error",
			object: "response",
			status: "completed",
			model: "test",
			created_at: 1,
			completed_at: 2,
			output: [],
			output_text: "",
		};
		const provider = createMockProvider(responseObject);
		provider.mapper.stream.map = (): ResponseStreamEvent[] => [
			{ type: "response.completed", response: responseObject },
		];
		let terminalInputSent = false;
		provider.chatClient.streamChat = async () =>
			new ReadableStream({
				pull(controller) {
					if (controller.desiredSize === null) return;
					if (terminalInputSent) {
						controller.error(new Error("upstream failed after terminal event"));
						return;
					}
					terminalInputSent = true;
					controller.enqueue({ event: "chunk", data: {} });
				},
			});
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const adapter = new DefaultAdapter();

		await expect(readStream(await adapter.stream(ctx))).rejects.toThrow(
			"upstream failed after terminal event",
		);
		expect(sessionStore.saved.length).toBe(1);
		expect(sessionStore.saved[0]?.id).toBe("resp_terminal_before_error");
	});
});
