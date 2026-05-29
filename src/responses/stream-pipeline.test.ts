import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { CompatibilityDiagnostic } from "../bridge/compatibility";
import { planOutputContract } from "../bridge/output";
import type { ProviderEdge } from "../bridge/provider-spec";
import { buildChatCompletionRequest } from "../bridge/request";
import { createToolPlanningProfile } from "../bridge/tools";
import { OutputContractSlot } from "../context/output-contract-slot";
import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseCreateRequest,
	ResponseObject,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import { createTestProviderEdge } from "../testing/provider-edge";
import type { ProviderStreamExchangeResult } from "./provider-exchange";
import { StreamPipeline } from "./stream-pipeline";
import { ATTR_UPSTREAM_LATENCY_MILLIS } from "./stream-transforms/stream-utils";

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

const degradedJsonSchemaPlan = {
	responseFormat: {
		action: "degraded",
		effectiveValue: { type: "json_object" },
	},
} as const;

function requireStrictJsonOutput(ctx: ResponsesContext): void {
	ctx.outputContract.set(
		planOutputContract({
			format: {
				type: "json_schema",
				name: "payload",
				schema: { type: "object" },
				strict: true,
			},
			responseFormatDecision: degradedJsonSchemaPlan.responseFormat,
		}),
	);
}

function createMockProvider(): ProviderEdge<unknown, unknown, unknown> {
	return createTestProviderEdge({ name: "mock" });
}

function createMockCtx(
	provider: ProviderEdge<unknown, unknown, unknown>,
	store = true,
	loggerOverrides: Partial<ResponsesContext["logger"]> = {},
	requestOverrides: Partial<ResponseCreateRequest> = {},
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
		request: { model: "mock/test", input: "hello", store, ...requestOverrides },
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
		outputContract: new OutputContractSlot(),
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
			providerStream,
			upstreamLatencyMillis,
			built: buildChatCompletionRequest({
				request: { ...ctx.request, stream: true },
				provider: ctx.provider.name,
				model: ctx.resolved.model,
				capabilities: ctx.provider.spec.capabilities,
				profile: createToolPlanningProfile({
					provider: ctx.provider.name,
					capabilities: ctx.provider.spec.capabilities,
					toProviderName: ctx.provider.spec.toolName.toProviderName,
				}),
				session: ctx.session,
			}),
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
		const usage = { input_tokens: 4, output_tokens: 2, total_tokens: 6 };
		const provider = createMockProvider();
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
				createStream([
					{
						event: "chunk",
						data: { text: "done", usage, finishReason: "stop" },
					},
				]),
			),
			async (_store, response) => {
				saved.push(response);
			},
		);

		const events = await readStream(await pipeline.stream(ctx));

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		]);
		expect(ctx.attributes.get(ATTR_UPSTREAM_LATENCY_MILLIS)).toBe(17);
		expect(traceEventNames(ctx)[0]).toBe("upstream.stream.event.raw");
		expect(
			traceEventNames(ctx).filter(
				(event) => event === "upstream.stream.event.transformed",
			),
		).toHaveLength(events.length);
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({
			id: "resp_stream",
			status: "completed",
			output_text: "done",
			usage,
		});
		expect(infoLogs).toEqual([
			{
				event: "responses.stream.completed",
				attr: expect.objectContaining({
					status: "completed",
					model: "test",
					outputCount: 1,
					usage,
					upstreamLatencyMillis: 17,
					streamEventCount: events.length,
				}) as Record<string, unknown>,
			},
		]);
	});

	test("skips session persistence when response storage is disabled", async () => {
		const provider = createMockProvider();
		const ctx = createMockCtx(provider, false);
		let saveCalls = 0;
		const pipeline = new StreamPipeline(
			createExchange(
				createStream([{ event: "chunk", data: { finishReason: "stop" } }]),
			),
			async () => {
				saveCalls++;
			},
		);

		await readStream(await pipeline.stream(ctx));

		expect(saveCalls).toBe(0);
	});

	test("emits response.failed when provider stream errors before any chunk", async () => {
		const provider = createMockProvider();
		const ctx = createMockCtx(provider);
		const events = await readStream(
			await new StreamPipeline(createExchange(createFailingStream())).stream(
				ctx,
			),
		);

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.failed",
		]);
		expect(events.at(-1)?.response).toMatchObject({
			id: "resp_stream",
			status: "failed",
			error: {
				code: "server_error",
				message: expect.stringContaining("upstream stream failed"),
			},
		});
		expect(ctx.traceEvents).toContainEqual(
			expect.objectContaining({
				kind: "error",
				event_name: "upstream.stream.error",
				code: "server_error",
				message: expect.stringContaining("upstream stream failed"),
			}),
		);
	});

	test("emits response.failed when the first provider chunk is malformed", async () => {
		const provider = createMockProvider();
		const ctx = createMockCtx(provider);
		const events = await readStream(
			await new StreamPipeline(
				createExchange(createStream([{ event: "chunk", data: { bad: true } }])),
			).stream(ctx),
		);

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.failed",
		]);
		expect(events.at(-1)?.response).toMatchObject({
			id: "resp_stream",
			status: "failed",
			error: {
				code: "server_error",
				message: expect.stringContaining("unknown field"),
			},
		});
	});

	test("persists terminal response from a completed provider stream", async () => {
		const provider = createMockProvider();
		const ctx = createMockCtx(provider);
		const saved: ResponseObject[] = [];
		const events = await readStream(
			await new StreamPipeline(
				createExchange(
					createStream([
						{
							event: "chunk",
							data: { text: "done", finishReason: "stop" },
						},
					]),
				),
				async (_store, response) => {
					saved.push(response);
				},
			).stream(ctx),
		);

		expect(events.at(-1)).toMatchObject({ type: "response.completed" });
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({
			id: "resp_stream",
			status: "completed",
			output_text: "done",
		});
	});

	test("includes request echo fields on terminal streamed responses", async () => {
		const provider = createMockProvider();
		const ctx = createMockCtx(
			provider,
			true,
			{},
			{
				stream: true,
				instructions: "Use concise JSON.",
				temperature: 0.2,
				tool_choice: "auto",
				tools: [
					{
						type: "function",
						name: "lookup",
						parameters: {},
						strict: true,
					},
				],
				parallel_tool_calls: false,
				metadata: { trace: "yes" },
				conversation: "conv_stream",
				reasoning: { effort: "low" },
				text: { format: { type: "json_object" } },
				safety_identifier: "safe_user",
			},
		);
		const events = await readStream(
			await new StreamPipeline(
				createExchange(
					createStream([
						{
							event: "chunk",
							data: { text: "{}", finishReason: "stop" },
						},
					]),
				),
			).stream(ctx),
		);

		expect(events.at(-1)).toMatchObject({
			type: "response.completed",
			response: {
				instructions: "Use concise JSON.",
				temperature: 0.2,
				tool_choice: "auto",
				parallel_tool_calls: false,
				stream: true,
				metadata: { trace: "yes" },
				conversation: { id: "conv_stream" },
				reasoning: { effort: "low" },
				text: { format: { type: "json_object" } },
				safety_identifier: "safe_user",
			},
		});
	});

	test("rewrites invalid strict JSON stream terminal responses before logging and saving", async () => {
		const provider = createMockProvider();
		const ctx = createMockCtx(provider);
		requireStrictJsonOutput(ctx);
		const saved: ResponseObject[] = [];
		const events = await readStream(
			await new StreamPipeline(
				createExchange(
					createStream([
						{
							event: "chunk",
							data: { text: "not json", finishReason: "stop" },
						},
					]),
				),
				async (_store, response) => {
					saved.push(response);
				},
			).stream(ctx),
		);

		const terminalEvents = events.filter(
			(event) =>
				event.type === "response.completed" ||
				event.type === "response.incomplete" ||
				event.type === "response.failed",
		);
		expect(terminalEvents).toHaveLength(1);
		expect(terminalEvents[0]).toMatchObject({
			type: "response.failed",
			response: { id: "resp_stream", status: "failed" },
		});
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({
			id: "resp_stream",
			status: "failed",
		});
		expect(ctx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "bridge.response.invalid_output_format",
				action: "rejected",
			}),
		);
	});
});
