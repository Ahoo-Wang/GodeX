import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../bridge/compatibility";
import type {
	ProviderEdge,
	ProviderSpec,
} from "../bridge/provider-spec/contract";
import {
	type BuildChatCompletionRequestResult,
	buildChatCompletionRequest,
} from "../bridge/request";
import { createToolPlanningProfile } from "../bridge/tools";
import { OutputContractSlot } from "../context/output-contract-slot";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseObject } from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import {
	completedTextResponse,
	createTestProviderEdge,
	type TestChatResponse,
} from "../testing/provider-edge";
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

function createProvider(
	response = completedTextResponse("", {
		input_tokens: 10,
		output_tokens: 5,
		total_tokens: 15,
		input_tokens_details: { cached_tokens: 3 },
	}),
): ProviderEdge<unknown, unknown, unknown> {
	return createTestProviderEdge({ name: "mock", response });
}

function createMockCtx(
	provider: ProviderEdge<unknown, unknown, unknown>,
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
		outputContract: new OutputContractSlot(),
		session: null,
		traceEvents,
	} as unknown as ResponsesContext & { traceEvents: unknown[] };
}

function createExchangeResult(
	ctx: ResponsesContext,
	providerResponse: TestChatResponse = completedTextResponse(),
): ProviderRequestExchangeResult {
	const built = buildRequest(ctx);
	ctx.outputContract.set(built.output);
	return { providerResponse, built };
}

function buildRequest(ctx: ResponsesContext): BuildChatCompletionRequestResult {
	return buildChatCompletionRequest({
		request: ctx.request,
		provider: ctx.provider.name,
		model: ctx.resolved.model,
		capabilities: specOf(ctx.provider).capabilities,
		profile: createToolPlanningProfile({
			provider: ctx.provider.name,
			capabilities: specOf(ctx.provider).capabilities,
			toProviderName: ctx.provider.spec.toolName.toProviderName,
		}),
		session: ctx.session,
	});
}

function specOf(
	provider: ProviderEdge<unknown, unknown, unknown>,
): ProviderSpec<unknown, unknown, unknown> {
	return provider.spec;
}

describe("SyncRequestPipeline", () => {
	test("maps provider response, records usage, logs completion, and saves", async () => {
		const providerResponse = completedTextResponse("", {
			input_tokens: 10,
			output_tokens: 5,
			total_tokens: 15,
			input_tokens_details: { cached_tokens: 3 },
		});
		const provider = createProvider(providerResponse);
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
				return createExchangeResult(ctx, providerResponse);
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

		expect(result).toMatchObject({
			id: "resp_sync",
			status: "completed",
			model: "test",
			usage: providerResponse.usage,
		});
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
					outputCount: 1,
					durationMillis: expect.any(Number),
					usage: providerResponse.usage,
					cacheHitRatio: 0.3,
				}) as Record<string, unknown>,
			},
		]);
		expect(saved).toEqual([{ store: sessionStore, response: result, ctx }]);
	});

	test("logs diagnostics after mapping the response", async () => {
		const provider = createProvider();
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
			code: "bridge.tool.unsupported",
			severity: "warn",
			action: "ignored",
			message: "Tool is not supported",
		});
		const exchange = {
			request: async (): Promise<ProviderRequestExchangeResult> => ({
				...createExchangeResult(ctx),
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
							code: "bridge.tool.unsupported",
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
		const provider = createProvider();
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
				...createExchangeResult(ctx),
			}),
		};
		const saveSession = async () => {
			throw new Error("session write failed");
		};

		const result = await new SyncRequestPipeline(exchange, saveSession).request(
			ctx,
		);

		expect(result).toMatchObject({ id: "resp_sync", status: "completed" });
		expect(warnings).toEqual([
			{
				event: "session.save.error",
				attr: {
					request_id: "req_test",
					response_id: "resp_sync",
					error: "Error: session write failed",
				},
			},
		]);
	});
});
