import { describe, expect, test } from "bun:test";
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
import type { ProviderRequestExchangeResult } from "../provider-exchange";
import { HostedWebSearchSyncRunner } from "./sync-runner";

describe("HostedWebSearchSyncRunner", () => {
	test("executes one managed search call and returns final response", async () => {
		const requests: ResponseCreateRequest[] = [];
		const ctx = createHostedSearchTestContext();
		const exchange = {
			async request(
				receivedCtx: ResponsesContext,
				options?: { request?: ResponseCreateRequest },
			): Promise<ProviderRequestExchangeResult> {
				const request = options?.request ?? receivedCtx.request;
				requests.push(request);
				return {
					built: buildManagedSearchRequest(receivedCtx, request),
					providerResponse:
						requests.length === 1
							? providerToolCallResponse({
									callId: "call_search",
									name: "web_search",
									argumentsValue: JSON.stringify({
										query: "latest bun release",
									}),
								})
							: providerTextResponse(
									"Bun latest release is listed in the search result.",
								),
				};
			},
		};
		const runner = new HostedWebSearchSyncRunner(exchange);

		const result = await runner.request(ctx);

		expect(result.response.output).toEqual([
			expect.objectContaining({
				type: "web_search_call",
				status: "completed",
				action: expect.objectContaining({
					type: "search",
					query: "latest bun release",
					sources: [
						{
							type: "url",
							url: "https://example.com/search/latest-bun-release",
						},
					],
				}),
			}),
			expect.objectContaining({
				type: "message",
				content: [
					{
						type: "output_text",
						text: "Bun latest release is listed in the search result.",
					},
				],
			}),
		]);
		expect(result.response.output_text).toContain("Bun latest");
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

	test("returns client fallback unchanged when search execution is client-visible", async () => {
		const ctx = createHostedSearchTestContext({ searchAvailable: false });
		const exchange = {
			async request(
				receivedCtx: ResponsesContext,
				options?: { request?: ResponseCreateRequest },
			): Promise<ProviderRequestExchangeResult> {
				const request = options?.request ?? receivedCtx.request;
				return {
					built: buildClientFallbackSearchRequest(receivedCtx, request),
					providerResponse: providerToolCallResponse({
						callId: "call_search",
						name: "web_search",
						argumentsValue: JSON.stringify({
							query: "latest bun release",
						}),
					}),
				};
			},
		};
		const runner = new HostedWebSearchSyncRunner(exchange);

		const result = await runner.request(ctx);

		expect(result.response.output).toContainEqual(
			expect.objectContaining({
				type: "function_call",
				name: "web_search",
			}),
		);
	});

	test("preserves earlier hosted search outputs across multiple continuations", async () => {
		const requests: ResponseCreateRequest[] = [];
		const ctx = createHostedSearchTestContext();
		const exchange = {
			async request(
				receivedCtx: ResponsesContext,
				options?: { request?: ResponseCreateRequest },
			): Promise<ProviderRequestExchangeResult> {
				const request = options?.request ?? receivedCtx.request;
				requests.push(request);
				if (requests.length === 1) {
					return {
						built: buildManagedSearchRequest(receivedCtx, request),
						providerResponse: providerToolCallResponse({
							callId: "call_search_1",
							name: "web_search",
							argumentsValue: JSON.stringify({ query: "first query" }),
						}),
					};
				}
				if (requests.length === 2) {
					return {
						built: buildManagedSearchRequest(receivedCtx, request),
						providerResponse: providerToolCallResponse({
							callId: "call_search_2",
							name: "web_search",
							argumentsValue: JSON.stringify({ query: "second query" }),
						}),
					};
				}
				return {
					built: buildManagedSearchRequest(receivedCtx, request),
					providerResponse: providerTextResponse("Final answer."),
				};
			},
		};
		const runner = new HostedWebSearchSyncRunner(exchange);

		const result = await runner.request(ctx);

		expect(
			result.response.output.filter((item) => item.type === "web_search_call"),
		).toHaveLength(2);
		expect(requests).toHaveLength(3);
		expect(requests[2]?.input).toEqual([
			{ role: "user", content: "hello" },
			expect.objectContaining({
				type: "function_call",
				call_id: "call_search_1",
			}),
			expect.objectContaining({
				type: "function_call_output",
				call_id: "call_search_1",
			}),
			expect.objectContaining({
				type: "function_call",
				call_id: "call_search_2",
			}),
			expect.objectContaining({
				type: "function_call_output",
				call_id: "call_search_2",
			}),
		]);
	});
});

function buildManagedSearchRequest(
	ctx: ResponsesContext,
	request: ResponseCreateRequest,
): BuildChatCompletionRequestResult {
	return buildSearchRequest(ctx, request, {
		mode: "godex_managed",
		available: true,
		onUnavailable: "client_tool_call",
	});
}

function buildClientFallbackSearchRequest(
	ctx: ResponsesContext,
	request: ResponseCreateRequest,
): BuildChatCompletionRequestResult {
	return buildSearchRequest(ctx, request, {
		mode: "auto",
		available: false,
		onUnavailable: "client_tool_call",
	});
}

function buildSearchRequest(
	ctx: ResponsesContext,
	request: ResponseCreateRequest,
	webSearch: Parameters<typeof buildChatCompletionRequest>[0]["webSearch"],
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
		webSearch,
	});
	ctx.outputContract.set(built.output);
	return built;
}

function providerToolCallResponse(input: {
	readonly callId: string;
	readonly name: string;
	readonly argumentsValue: string;
}): unknown {
	return {
		choices: [
			{
				message: {
					tool_calls: [
						{
							id: input.callId,
							type: "function",
							function: {
								name: input.name,
								arguments: input.argumentsValue,
							},
						},
					],
				},
				finish_reason: "tool_calls",
			},
		],
		usage: {
			input_tokens: 1,
			output_tokens: 1,
			total_tokens: 2,
		},
	};
}

function providerTextResponse(text: string): unknown {
	return {
		choices: [
			{
				message: { content: text },
				finish_reason: "stop",
			},
		],
		usage: {
			input_tokens: 2,
			output_tokens: 4,
			total_tokens: 6,
		},
	};
}

function createHostedSearchTestContext(
	options: { readonly searchAvailable?: boolean } = {},
): ResponsesContext {
	const searchAvailable = options.searchAvailable ?? true;
	const provider = createTestProviderEdge({ name: "mock" });
	const traceEvents: unknown[] = [];
	return {
		provider,
		app: {
			config: {
				web_search: {
					...DEFAULT_WEB_SEARCH_CONFIG,
					mode: "godex_managed",
					provider: searchAvailable ? "mock" : "none",
				},
			},
			search: {
				name: searchAvailable ? "mock" : "none",
				available: searchAvailable,
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
			tools: [{ type: "web_search", search_context_size: "medium" }],
		},
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
