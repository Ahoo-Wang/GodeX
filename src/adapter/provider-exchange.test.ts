import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import type { Provider } from "./provider";
import { ProviderExchange } from "./provider-exchange";

function createMockProvider(
	providerRequest: unknown,
	providerResponse: unknown,
	providerStreamEvents: JsonServerSentEvent<unknown>[] = [],
): Provider<unknown, unknown, unknown> {
	return {
		name: "mock",
		mapper: {
			request: { map: () => providerRequest },
			response: {
				map: () => {
					throw new Error("response mapper must not be called");
				},
			},
			stream: { map: () => [] },
		},
		client: {
			request: async () => providerResponse,
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
			promptCacheRequestAnalyzer: {
				analyze: (input: {
					request: unknown;
					providerRequest: unknown;
					provider?: string;
					model?: string;
				}) => ({
					provider: input.provider ?? "mock",
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
		request: { model: "mock/test", input: "hello", store: true },
		requestId: "req_test",
		responseId: "resp_test",
		createdAt: Math.floor(Date.now() / 1000),
		resolved: { provider: "mock", model: "test" },
		diagnostics: [],
		addDiagnostic() {},
		attributes: new Map(),
		session: null,
		traceEvents,
	} as unknown as ResponsesContext & { traceEvents: unknown[] };
}

function traceEventNames(ctx: { traceEvents: unknown[] }): string[] {
	return ctx.traceEvents
		.filter((event) => (event as { kind?: string }).kind === "event")
		.map((event) => (event as { event_name: string }).event_name);
}

describe("ProviderExchange", () => {
	test("maps the provider request before calling the sync client", async () => {
		const providerRequest = { model: "test" };
		const providerResponse = { id: "upstream" };
		const provider = createMockProvider(providerRequest, providerResponse);
		const calls: string[] = [];
		provider.mapper.request.map = () => {
			calls.push("map");
			return providerRequest;
		};
		provider.client.request = async (body) => {
			calls.push("client");
			expect(body).toBe(providerRequest);
			return providerResponse;
		};
		const ctx = createMockCtx(provider);

		const result = await new ProviderExchange().request(ctx);

		expect(calls).toEqual(["map", "client"]);
		expect(result.providerResponse).toBe(providerResponse);
	});

	test("records prompt-cache request trace, provider response trace, and sync logs", async () => {
		const providerRequest = { model: "test", prompt_cache_key: "cache" };
		const providerResponse = { id: "upstream", usage: { prompt_tokens: 1 } };
		const provider = createMockProvider(providerRequest, providerResponse);
		const debugLogs: Array<{ event: string; attr: Record<string, unknown> }> =
			[];
		const ctx = createMockCtx(provider, {
			debug: (event, attr) => {
				debugLogs.push({
					event,
					attr: typeof attr === "function" ? attr() : (attr ?? {}),
				});
			},
		});

		await new ProviderExchange().request(ctx);

		expect(
			ctx.traceEvents.map((event) => (event as { kind: string }).kind),
		).toEqual(["request", "event", "event"]);
		expect(traceEventNames(ctx)).toEqual([
			"provider.request.body",
			"provider.response.body",
		]);
		expect(debugLogs).toEqual([
			{
				event: "provider.request.sending",
				attr: { provider: "mock", model: "test", stream: false },
			},
			{
				event: "provider.response.received",
				attr: expect.objectContaining({
					provider: "mock",
					model: "test",
					upstreamDurationMillis: expect.any(Number),
				}) as Record<string, unknown>,
			},
		]);
	});

	test("opens stream exchange without mapping Responses output", async () => {
		const providerRequest = { model: "test" };
		const provider = createMockProvider(providerRequest, {}, [
			{ event: "chunk", data: { text: "hi" } },
		]);
		let responseMapCalls = 0;
		provider.mapper.response.map = () => {
			responseMapCalls++;
			throw new Error("response mapper must not be called");
		};
		let providerStream:
			| ReadableStream<JsonServerSentEvent<unknown>>
			| undefined;
		provider.client.stream = async (body) => {
			expect(body).toBe(providerRequest);
			providerStream = new ReadableStream({
				start(controller) {
					controller.enqueue({ event: "chunk", data: { text: "hi" } });
					controller.close();
				},
			});
			return providerStream;
		};
		const debugLogs: Array<{ event: string; attr: Record<string, unknown> }> =
			[];
		const ctx = createMockCtx(provider, {
			debug: (event, attr) => {
				debugLogs.push({
					event,
					attr: typeof attr === "function" ? attr() : (attr ?? {}),
				});
			},
		});

		const result = await new ProviderExchange().stream(ctx);

		expect(responseMapCalls).toBe(0);
		expect(result.mapper).toBe(provider.mapper);
		expect(providerStream).toBe(result.providerStream);
		expect(result.upstreamLatencyMillis).toEqual(expect.any(Number));
		expect(traceEventNames(ctx)).toEqual(["provider.request.body"]);
		expect(debugLogs).toEqual([
			{
				event: "provider.request.sending",
				attr: { provider: "mock", model: "test", stream: true },
			},
			{
				event: "provider.stream.connected",
				attr: expect.objectContaining({
					provider: "mock",
					model: "test",
					upstreamLatencyMillis: expect.any(Number),
				}) as Record<string, unknown>,
			},
		]);
	});
});
