import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseObject } from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import type { CompatibilityDiagnostic } from "./compatibility";
import type { Provider } from "./provider";
import type { ProviderRequestExchangeResult } from "./provider-exchange";
import { SyncRequestPipeline } from "./sync-request-pipeline";

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

function createResponseObject(id = "resp_sync"): ResponseObject {
	return {
		id,
		object: "response",
		status: "completed",
		model: "test",
		created_at: 1,
		completed_at: 2,
		output: [],
		output_text: "",
		usage: {
			input_tokens: 10,
			output_tokens: 5,
			total_tokens: 15,
			input_tokens_details: { cached_tokens: 3 },
		},
	};
}

function createMockProvider(
	responseObject: ResponseObject,
	responseMapCalls: unknown[],
): Provider<unknown, unknown, unknown> {
	return {
		name: "mock",
		mapper: {
			request: { map: () => ({ model: "test" }) },
			response: {
				map: (_ctx, result) => {
					responseMapCalls.push(result);
					return responseObject;
				},
			},
			stream: { map: () => [] },
		},
		client: {
			request: async () => ({}),
			stream: async () => new ReadableStream(),
		},
	};
}

function createMockCtx(
	provider: Provider<unknown, unknown, unknown>,
	sessionStore: ResponseSessionStore,
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
			sessionStore,
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
		responseId: "resp_sync",
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

describe("SyncRequestPipeline", () => {
	test("maps provider response, records usage, logs completion, and saves", async () => {
		const providerResponse = {
			id: "upstream",
			usage: { prompt_tokens_details: { cached_tokens: 2 } },
		};
		const responseObject = createResponseObject();
		const responseMapCalls: unknown[] = [];
		const provider = createMockProvider(responseObject, responseMapCalls);
		const sessionStore = createMockSessionStore();
		const infoLogs: Array<{ event: string; attr: Record<string, unknown> }> =
			[];
		const ctx = createMockCtx(provider, sessionStore, {
			info: (event, attr) => {
				infoLogs.push({
					event,
					attr: typeof attr === "function" ? attr() : (attr ?? {}),
				});
			},
		});
		const exchange = {
			request: async (
				receivedCtx: ResponsesContext,
			): Promise<ProviderRequestExchangeResult> => {
				expect(receivedCtx).toBe(ctx);
				return { providerResponse };
			},
		};
		const saved: Array<{
			store: ResponseSessionStore;
			response: ResponseObject;
			ctx: ResponsesContext;
		}> = [];
		const saveSession = async (
			store: ResponseSessionStore,
			response: ResponseObject,
			receivedCtx: ResponsesContext,
		) => {
			saved.push({ store, response, ctx: receivedCtx });
		};

		const result = await new SyncRequestPipeline(exchange, saveSession).request(
			ctx,
		);

		expect(result).toBe(responseObject);
		expect(responseMapCalls).toEqual([providerResponse]);
		expect(
			ctx.traceEvents.filter(
				(event) => (event as { kind?: string }).kind === "usage",
			),
		).toEqual([
			expect.objectContaining({
				kind: "usage",
				usage: expect.objectContaining({ cached_tokens: 3 }),
			}),
		]);
		expect(infoLogs).toEqual([
			{
				event: "responses.request.completed",
				attr: expect.objectContaining({
					status: "completed",
					model: "test",
					outputCount: 0,
					durationMillis: expect.any(Number),
					usage: responseObject.usage,
					cacheHitRatio: 0.3,
				}) as Record<string, unknown>,
			},
		]);
		expect(saved).toEqual([
			{ store: sessionStore, response: responseObject, ctx },
		]);
	});

	test("logs diagnostics after mapping the response", async () => {
		const responseObject = createResponseObject("resp_diag");
		const provider = createMockProvider(responseObject, []);
		const sessionStore = createMockSessionStore();
		const warnings: Array<{ event: string; attr: Record<string, unknown> }> =
			[];
		const ctx = createMockCtx(provider, sessionStore, {
			warn: (event, attr) => {
				warnings.push({
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
			message: "Tool is not supported",
		});
		const exchange = {
			request: async (): Promise<ProviderRequestExchangeResult> => ({
				providerResponse: {},
			}),
		};

		await new SyncRequestPipeline(exchange, async () => {}).request(ctx);

		expect(warnings).toEqual([
			{
				event: "responses.diagnostics",
				attr: expect.objectContaining({
					request_id: "req_test",
					response_id: "resp_sync",
					count: 1,
					diagnostics: [
						{
							code: "adapter.tool.unsupported",
							severity: "warn",
							action: "ignored",
							message: "Tool is not supported",
						},
					],
					durationMillis: expect.any(Number),
				}) as Record<string, unknown>,
			},
		]);
	});

	test("returns response and logs warning when session persistence fails", async () => {
		const responseObject = createResponseObject("resp_save_failed");
		const provider = createMockProvider(responseObject, []);
		const sessionStore = createMockSessionStore();
		const warnings: Array<{ event: string; attr: Record<string, unknown> }> =
			[];
		const ctx = createMockCtx(provider, sessionStore, {
			warn: (event, attr) => {
				warnings.push({
					event,
					attr: typeof attr === "function" ? attr() : (attr ?? {}),
				});
			},
		});
		const exchange = {
			request: async (): Promise<ProviderRequestExchangeResult> => ({
				providerResponse: {},
			}),
		};
		const saveSession = async () => {
			throw new Error("session write failed");
		};

		const result = await new SyncRequestPipeline(exchange, saveSession).request(
			ctx,
		);

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
});
