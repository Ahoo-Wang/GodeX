import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { CompatibilityDiagnostic } from "../bridge/compatibility";
import type { ProviderEdge } from "../bridge/provider-spec";
import { OutputContractSlot } from "../context/output-contract-slot";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import { createTestProviderEdge } from "../testing/provider-edge";
import { ProviderExchange } from "./provider-exchange";

function createMockProvider(
	providerResponse: unknown,
	providerStreamEvents: JsonServerSentEvent<unknown>[] = [],
	onRequest?: (body: unknown) => void,
	onStream?: (body: unknown) => void,
): ProviderEdge<unknown, unknown, unknown> {
	return createTestProviderEdge({
		name: "mock",
		response: providerResponse as never,
		streamEvents: providerStreamEvents,
		onRequest,
		onStream,
	});
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
	provider: ProviderEdge<unknown, unknown, unknown>,
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
		request: { model: "mock/test", input: "hello", store: true },
		requestId: "req_test",
		responseId: "resp_test",
		createdAt: Math.floor(Date.now() / 1000),
		resolved: { provider: "mock", model: "test" },
		diagnostics: [],
		addDiagnostic(diagnostic: CompatibilityDiagnostic) {
			(
				this as unknown as { diagnostics: CompatibilityDiagnostic[] }
			).diagnostics.push(diagnostic);
		},
		attributes: new Map(),
		outputContract: new OutputContractSlot(),
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
	test("builds the provider request before calling the sync edge", async () => {
		const providerResponse = { choices: [{ finish_reason: "stop" }] };
		const calls: unknown[] = [];
		const provider = createMockProvider(providerResponse, [], (body) => {
			calls.push(body);
		});
		const ctx = createMockCtx(provider);

		const result = await new ProviderExchange().request(ctx);

		expect(calls).toEqual([
			{
				model: "test",
				messages: [{ role: "user", content: "hello" }],
			},
		]);
		expect(result.providerResponse).toBe(providerResponse);
	});

	test("records provider request and response payload events", async () => {
		const providerResponse = { choices: [{ finish_reason: "stop" }] };
		const provider = createMockProvider(providerResponse);
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

	test("records tool planning decisions as compatibility diagnostics", async () => {
		const providerResponse = { choices: [{ finish_reason: "stop" }] };
		const provider = createMockProvider(providerResponse);
		const ctx = createMockCtx(provider);
		(ctx as unknown as { request: ResponsesContext["request"] }).request = {
			...ctx.request,
			tools: [
				{
					type: "custom",
					name: "raw.tool",
					description: "Run raw text.",
					format: { type: "text" },
				},
			],
		};

		await new ProviderExchange().request(ctx);

		expect(ctx.diagnostics).toContainEqual(
			expect.objectContaining({
				path: "tools[type=custom]",
				action: "ignored",
				message: expect.stringContaining("does not support Responses tool"),
			}),
		);
	});

	test("opens stream exchange without mapping Responses output", async () => {
		let providerStream:
			| ReadableStream<JsonServerSentEvent<unknown>>
			| undefined;
		const streamBodies: unknown[] = [];
		const provider = createTestProviderEdge({
			name: "mock",
			async stream(body) {
				streamBodies.push(body);
				providerStream = new ReadableStream({
					start(controller) {
						controller.enqueue({ event: "chunk", data: { text: "hi" } });
						controller.close();
					},
				});
				return providerStream;
			},
		});
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

		expect(streamBodies).toEqual([
			{
				model: "test",
				messages: [{ role: "user", content: "hello" }],
				stream: true,
				stream_options: { include_usage: true },
			},
		]);
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
