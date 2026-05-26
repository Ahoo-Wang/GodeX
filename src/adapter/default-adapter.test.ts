import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import type { CompatibilityDiagnostic } from "./compatibility";
import { DefaultAdapter } from "./default-adapter";
import {
	StreamResponsePhase,
	StreamResponseState,
} from "./mapper/chat/stream-response-state";
import type { Provider } from "./provider";

function toolCallMapper(call: { id: string; name: string; arguments: string }) {
	return {
		type: "function_call" as const,
		id: call.id,
		call_id: call.id,
		name: call.name,
		arguments: call.arguments,
	};
}

function createMockProvider(
	providerRes: unknown,
	streamEvents: ResponseStreamEvent[] = [],
	providerStreamEvents: JsonServerSentEvent<unknown>[] = [],
): Provider<unknown, unknown, unknown> {
	return {
		name: "mock",
		mapper: {
			request: { map: () => ({ model: "test" }) },
			response: {
				map: (_ctx: ResponsesContext, _res: unknown) => providerRes as never,
			},
			stream: {
				map: () => streamEvents as never[],
			},
		},
		client: {
			request: async () => providerRes,
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

	const traceEvents: unknown[] = [];

	return {
		provider,
		app: {
			sessionStore,
			traceEnabled: true,
			traceRecorder: {
				record: (event: unknown) => {
					traceEvents.push(event);
				},
			},
			promptCacheRequestAnalyzer: {
				analyze: (input: {
					request: unknown;
					providerRequest: unknown;
					provider?: string;
					model?: string;
				}) => ({
					provider: input.provider ?? "test",
					model: input.model ?? "test",
					requested_prompt_cache_key: (input.request as Record<string, unknown>)
						?.prompt_cache_key as string | undefined,
					requested_prompt_cache_retention: (
						input.request as Record<string, unknown>
					)?.prompt_cache_retention as string | undefined,
					prompt_cache_key: (input.providerRequest as Record<string, unknown>)
						?.prompt_cache_key as string | undefined,
					prompt_cache_retention: (
						input.providerRequest as Record<string, unknown>
					)?.prompt_cache_retention as string | undefined,
					has_cache_control: false,
					prefix_parts: [],
					static_prefix_hash: "hash",
					static_prefix_bytes: 0,
					dynamic_text_candidates: [],
				}),
			},
			promptCacheDetector: {
				detect: () => ({
					risk_level: "none" as const,
					reasons: [],
					prefix_hash: "hash",
					prefix_bytes: 0,
					passthrough: {
						prompt_cache_key: true,
						prompt_cache_retention: true,
						cache_control: false,
					},
				}),
			},
			promptCacheObservationIndex: {
				get: () => null,
				remember: () => {},
			},
		},
		logger,
		request: { store },
		requestId: "req_test",
		responseId: "resp_123",
		createdAt: Math.floor(Date.now() / 1000),
		resolved: { provider: "test", model: "test" },
		diagnostics: [],
		addDiagnostic(d: CompatibilityDiagnostic) {
			(
				this as unknown as { diagnostics: CompatibilityDiagnostic[] }
			).diagnostics.push(d);
		},
		attributes: new Map(),
		session: null,
		traceEvents,
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
	test("request maps, calls client, maps response, saves session", async () => {
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

	test("stream persists from stream response state snapshot", async () => {
		const sessionStore = createMockSessionStore();
		const provider = createMockProvider({}, [], [{ event: "chunk", data: {} }]);
		const ctx = createMockCtx(provider, sessionStore);
		provider.mapper.stream.map = (
			ctx: ResponsesContext,
		): ResponseStreamEvent[] => {
			const state = StreamResponseState.create(ctx, {
				toolCallOutputItemMapper: toolCallMapper,
			});
			state.start();
			state.onFinish({ status: "completed" });
			return [
				{ type: "response.output_text.done", text: "done" },
			] as ResponseStreamEvent[];
		};

		const adapter = new DefaultAdapter();
		await readStream(await adapter.stream(ctx));

		expect(sessionStore.saved.length).toBe(1);
		expect(sessionStore.saved[0]?.id).toBe("resp_123");
	});

	test("request records trace events for provider request and response", async () => {
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

		const ctx = createMockCtx(
			provider,
			sessionStore,
			true,
		) as ResponsesContext & {
			traceEvents: unknown[];
		};

		const adapter = new DefaultAdapter();
		await adapter.request(ctx);

		const kindEvents = ctx.traceEvents.map((e) => (e as { kind: string }).kind);
		expect(kindEvents).toEqual(["request", "event", "event", "usage"]);
		const detailEvents = ctx.traceEvents.filter(
			(e) => (e as { kind: string }).kind === "event",
		);
		expect(
			detailEvents.map((e) => (e as { event_name: string }).event_name),
		).toEqual(["provider.request.body", "provider.response.body"]);
	});

	test("request trace does not mutate provider request and records cached usage", async () => {
		const providerRequest = {
			model: "test",
			messages: [{ role: "system", content: "static" }],
			prompt_cache_key: "cache-key",
		};
		const original = structuredClone(providerRequest);
		const responseObject = {
			id: "resp_cache",
			object: "response" as const,
			status: "completed" as const,
			model: "test",
			created_at: 1,
			completed_at: 1,
			output: [],
			output_text: "",
			usage: {
				input_tokens: 100,
				output_tokens: 20,
				total_tokens: 120,
				input_tokens_details: { cached_tokens: 40 },
			},
		};
		const provider = createMockProvider(responseObject);
		provider.mapper.request.map = () => providerRequest;
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(
			provider,
			sessionStore,
			true,
		) as ResponsesContext & {
			traceEvents: unknown[];
		};
		await new DefaultAdapter().request(ctx);
		expect(providerRequest).toEqual(original);
		expect(ctx.traceEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "request" }),
				expect.objectContaining({
					kind: "event",
					event_name: "provider.request.body",
				}),
				expect.objectContaining({
					kind: "event",
					event_name: "provider.response.body",
				}),
				expect.objectContaining({
					kind: "usage",
					usage: expect.objectContaining({ cached_tokens: 40 }),
				}),
			]),
		);
	});

	test("stream records trace events for request body and stream events", async () => {
		const responseObject: ResponseObject = {
			id: "resp_stream_trace",
			object: "response",
			status: "completed",
			model: "test",
			created_at: 1,
			completed_at: 2,
			output: [],
			output_text: "",
			usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 },
		};
		const provider = createMockProvider(
			responseObject,
			[{ type: "response.completed", response: responseObject }],
			[{ event: "chunk", data: { text: "hi" } }],
		);
		const sessionStore = createMockSessionStore();

		const ctx = createMockCtx(
			provider,
			sessionStore,
			true,
		) as ResponsesContext & {
			traceEvents: unknown[];
		};

		const adapter = new DefaultAdapter();
		await readStream(await adapter.stream(ctx));

		const kindEvents = ctx.traceEvents.map((e) => (e as { kind: string }).kind);
		expect(kindEvents).toEqual(["request", "event", "event", "event", "usage"]);
		const eventKind = ctx.traceEvents.filter(
			(e) => (e as { kind: string }).kind === "event",
		);
		expect(
			eventKind.map((e) => (e as { event_name: string }).event_name),
		).toEqual([
			"provider.request.body",
			"upstream.stream.event.raw",
			"upstream.stream.event.transformed",
		]);
	});

	test("closes stream cleanly on provider read errors before any chunk", async () => {
		const upstreamError = new Error("upstream stream failed");
		const provider = createMockProvider({});
		provider.client.stream = async () =>
			new ReadableStream({
				start(controller) {
					controller.error(upstreamError);
				},
			});
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const adapter = new DefaultAdapter();

		// Error before any chunk: stream closes cleanly, no state to emit failed
		const events = await readStream(await adapter.stream(ctx));
		expect(events).toEqual([]);
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
		provider.mapper.stream.map = (
			ctx: ResponsesContext,
		): ResponseStreamEvent[] => {
			const state =
				StreamResponseState.get(ctx) ??
				StreamResponseState.create(ctx, {
					toolCallOutputItemMapper: (call) => ({
						type: "function_call",
						call_id: call.id,
						name: call.name,
						arguments: call.arguments,
					}),
				});
			if (state.phase === StreamResponsePhase.IDLE) state.start();
			return state.onFinish({ status: "completed" });
		};
		let terminalInputSent = false;
		provider.client.stream = async () =>
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

		const events = await readStream(await adapter.stream(ctx));
		// Terminal event already emitted; post-terminal error is silently dropped
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "response.completed" }),
			]),
		);
		expect(sessionStore.saved.length).toBe(1);
	});

	test("request logs diagnostics when present", async () => {
		const responseObject = {
			id: "resp_diag",
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

		const warns: Array<{ event: string; attr: Record<string, unknown> }> = [];
		const ctx = createMockCtx(provider, sessionStore, true, {
			warn: (event, attr) => {
				warns.push({
					event,
					attr:
						typeof attr === "function"
							? (attr as () => Record<string, unknown>)()
							: (attr ?? {}),
				});
			},
		});

		ctx.addDiagnostic({
			code: "adapter.tool.unsupported",
			severity: "warn",
			action: "ignored",
			message: "Tool 'code_interpreter' is not supported",
		});

		const adapter = new DefaultAdapter();
		await adapter.request(ctx);

		const diagInfos = warns.filter((i) => i.event === "responses.diagnostics");
		expect(diagInfos.length).toBe(1);
		expect(diagInfos[0]?.attr).toMatchObject({
			count: 1,
			diagnostics: [
				{
					code: "adapter.tool.unsupported",
					severity: "warn",
					action: "ignored",
					message: "Tool 'code_interpreter' is not supported",
				},
			],
		});
	});

	test("request records payload trace without logger trace calls", async () => {
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
		const traces: string[] = [];
		const ctx = createMockCtx(provider, sessionStore, true, {
			trace: (event) => traces.push(event),
		}) as ResponsesContext & { traceEvents: unknown[] };
		await new DefaultAdapter().request(ctx);
		expect(traces).toEqual([]);
		expect(ctx.traceEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "request" }),
				expect.objectContaining({ event_name: "provider.request.body" }),
				expect.objectContaining({ event_name: "provider.response.body" }),
			]),
		);
	});

	test("stream records payload trace without logger trace calls", async () => {
		const responseObject: ResponseObject = {
			id: "resp_stream_trace",
			object: "response",
			status: "completed",
			model: "test",
			created_at: 1,
			completed_at: 2,
			output: [],
			output_text: "",
			usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 },
		};
		const provider = createMockProvider(
			responseObject,
			[{ type: "response.completed", response: responseObject }],
			[{ event: "chunk", data: { text: "hi" } }],
		);
		const sessionStore = createMockSessionStore();
		const traces: string[] = [];
		const ctx = createMockCtx(provider, sessionStore, true, {
			trace: (event) => traces.push(event),
		}) as ResponsesContext & { traceEvents: unknown[] };
		const adapter = new DefaultAdapter();
		await readStream(await adapter.stream(ctx));
		expect(traces).toEqual([]);
		expect(ctx.traceEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "request" }),
				expect.objectContaining({ kind: "usage" }),
			]),
		);
	});
});
