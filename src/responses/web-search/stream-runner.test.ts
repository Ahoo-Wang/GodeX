import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { CompatibilityDiagnostic } from "../../bridge/compatibility";
import {
	type BuildChatCompletionRequestResult,
	buildChatCompletionRequest,
} from "../../bridge/request";
import { createToolPlanningProfile } from "../../bridge/tools";
import { DEFAULT_WEB_SEARCH_CONFIG } from "../../config/sections/web-search";
import { OutputContractSlot } from "../../context/output-contract-slot";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseCreateRequest } from "../../protocol/openai/responses";
import type { SearchRequest } from "../../search";
import type {
	ResponseSessionStore,
	StoredResponseSession,
} from "../../session";
import { createTestProviderEdge } from "../../testing/provider-edge";
import type { ProviderStreamExchangeResult } from "../provider-exchange";
import { HostedWebSearchStreamRunner } from "./stream-runner";

describe("HostedWebSearchStreamRunner", () => {
	test("emits hosted web search lifecycle before continuation text", async () => {
		const requests: ResponseCreateRequest[] = [];
		const ctx = createHostedSearchTestContext();
		const exchange = {
			async stream(
				receivedCtx: ResponsesContext,
				options?: { request?: ResponseCreateRequest },
			): Promise<ProviderStreamExchangeResult> {
				const request = options?.request ?? receivedCtx.request;
				requests.push(request);
				return {
					providerStream:
						requests.length === 1
							? createStream([
									{
										event: "chunk",
										data: {
											toolCall: {
												index: 0,
												id: "call_search",
												type: "function",
												name: "web_search",
												arguments: JSON.stringify({
													query: "latest bun release",
												}),
											},
											finishReason: "tool_calls",
										},
									},
								])
							: createStream([
									{
										event: "chunk",
										data: {
											text: "Bun latest release is listed in the mock result.",
											finishReason: "stop",
										},
									},
								]),
					upstreamLatencyMillis: 17,
					built: buildManagedSearchRequest(receivedCtx, request),
				};
			},
		};
		const runner = new HostedWebSearchStreamRunner(exchange);

		const { stream, machine } = await runner.stream(ctx);
		const events = await readStream(stream);

		expect(events.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				"response.web_search_call.in_progress",
				"response.web_search_call.searching",
				"response.web_search_call.completed",
				"response.output_text.delta",
				"response.completed",
			]),
		);
		expect(events.map((event) => event.type)).not.toContain(
			"response.function_call_arguments.delta",
		);
		expect(
			events.find(
				(event) =>
					event.type === "response.output_item.added" &&
					event.item?.type === "web_search_call",
			)?.item,
		).toMatchObject({ type: "web_search_call", status: "in_progress" });
		expect(machine.snapshot.output).toEqual([
			expect.objectContaining({ type: "web_search_call", status: "completed" }),
			expect.objectContaining({ type: "message" }),
		]);
		expect(requests).toHaveLength(2);
		expect(requests[1]?.input).toEqual([
			{ role: "user", content: "hello" },
			expect.objectContaining({
				type: "function_call",
				call_id: "call_search",
				name: "web_search",
			}),
			expect.objectContaining({
				type: "function_call_output",
				call_id: "call_search",
				output: expect.stringContaining("latest bun release"),
			}),
		]);
	});
});

function buildManagedSearchRequest(
	ctx: ResponsesContext,
	request: ResponseCreateRequest,
): BuildChatCompletionRequestResult {
	const built = buildChatCompletionRequest({
		request,
		provider: ctx.provider.name,
		model: ctx.resolved.model,
		capabilities: ctx.provider.spec.capabilities,
		profile: createToolPlanningProfile({
			provider: ctx.provider.name,
			capabilities: ctx.provider.spec.capabilities,
			toProviderName: ctx.provider.spec.toolName.toProviderName,
		}),
		session: ctx.session,
		webSearch: {
			mode: "godex_managed",
			available: true,
			onUnavailable: "client_tool_call",
		},
	});
	ctx.outputContract.set(built.output);
	return built;
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

function createHostedSearchTestContext(): ResponsesContext {
	const provider = createTestProviderEdge({ name: "mock" });
	const traceEvents: unknown[] = [];
	return {
		provider,
		app: {
			config: {
				web_search: {
					...DEFAULT_WEB_SEARCH_CONFIG,
					mode: "godex_managed",
					provider: "mock",
				},
			},
			search: {
				name: "mock",
				available: true,
				search: async (request: SearchRequest) => ({
					query: request.query,
					results: [
						{
							title: `Mock result for ${request.query}`,
							url: "https://example.com/search/latest-bun-release",
							snippet: `Deterministic mock search result for ${request.query}.`,
						},
					],
				}),
			},
			sessionStore: createMockSessionStore(),
			traceEnabled: true,
			traceRecorder: {
				record: (event: unknown) => {
					traceEvents.push(event);
				},
			},
		},
		logger: {
			info: () => {},
			debug: () => {},
			trace: () => {},
			error: () => {},
			warn: () => {},
		},
		request: {
			model: "mock/test",
			input: "hello",
			store: true,
			stream: true,
			tools: [{ type: "web_search", search_context_size: "medium" }],
		},
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
	} as unknown as ResponsesContext;
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
