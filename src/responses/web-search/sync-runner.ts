import { reconstructResponseObject } from "../../bridge/response";
import { DEFAULT_WEB_SEARCH_CONFIG } from "../../config/sections/web-search";
import type { ResponsesContext } from "../../context/responses-context";
import { BRIDGE_REQUEST_UNSUPPORTED_TOOL, BridgeError } from "../../error";
import type {
	ResponseItem,
	ResponseObject,
} from "../../protocol/openai/responses";
import type { SearchRequest, SearchResponse } from "../../search";
import type {
	ProviderExchangeRequestOptions,
	ProviderRequestExchangeResult,
} from "../provider-exchange";
import { responseRequestEchoFields } from "../response-request-echo";
import { extractManagedWebSearchCalls, webSearchCallItem } from "./calls";
import { buildContinuationRequest } from "./continuation";

export interface HostedWebSearchSyncResult {
	readonly response: ResponseObject;
}

export interface HostedWebSearchSyncExchange {
	request(
		ctx: ResponsesContext,
		options?: ProviderExchangeRequestOptions,
	): Promise<ProviderRequestExchangeResult>;
}

export class HostedWebSearchSyncRunner {
	constructor(private readonly exchange: HostedWebSearchSyncExchange) {}

	async request(ctx: ResponsesContext): Promise<HostedWebSearchSyncResult> {
		let request = ctx.request;
		const hostedItems: ResponseItem[] = [];
		const config = ctx.app.config.web_search ?? DEFAULT_WEB_SEARCH_CONFIG;

		for (let iteration = 0; iteration <= config.max_iterations; iteration++) {
			const { providerResponse, built } = await this.exchange.request(ctx, {
				request,
			});
			const response = reconstructResponseObject({
				requestId: ctx.requestId,
				responseId: ctx.responseId,
				createdAt: ctx.createdAt,
				completedAt: Math.floor(Date.now() / 1000),
				provider: ctx.provider.name,
				model: ctx.resolved.model,
				providerResponse,
				accessor: ctx.provider.spec.response,
				toolIdentity: built.tools,
				outputContract: built.output,
				echo: responseRequestEchoFields(ctx),
			});

			const calls = extractManagedWebSearchCalls({
				output: response.output,
				tools: built.tools,
			});
			if (calls.length === 0) {
				return {
					response: {
						...response,
						output: [...hostedItems, ...response.output],
					},
				};
			}

			if (iteration >= config.max_iterations) {
				throw new BridgeError(
					BRIDGE_REQUEST_UNSUPPORTED_TOOL,
					"web_search max_iterations exceeded.",
					{
						provider: ctx.resolved.provider,
						model: ctx.resolved.model,
						parameter: "web_search.max_iterations",
					},
				);
			}

			const [call] = calls;
			if (!call) {
				throw new BridgeError(
					BRIDGE_REQUEST_UNSUPPORTED_TOOL,
					"web_search call could not be extracted.",
					{
						provider: ctx.resolved.provider,
						model: ctx.resolved.model,
						parameter: "web_search",
					},
				);
			}
			const search = await executeSearchWithTimeout(
				call.search,
				config.timeout_ms,
				(signal) => ctx.app.search.search(call.search, signal),
			);
			hostedItems.push(
				webSearchCallItem({
					responseId: ctx.responseId,
					index: hostedItems.length,
					query: call.query,
					queries: call.queries,
					sources: search.results.map((result) => ({ url: result.url })),
					status: "completed",
				}),
			);
			request = buildContinuationRequest({
				original: request,
				previousItems: response.output,
				callId: call.providerCall.callId,
				search,
			});
		}

		throw new BridgeError(
			BRIDGE_REQUEST_UNSUPPORTED_TOOL,
			"web_search loop terminated unexpectedly.",
			{
				provider: ctx.resolved.provider,
				model: ctx.resolved.model,
				parameter: "web_search",
			},
		);
	}
}

async function executeSearchWithTimeout(
	request: SearchRequest,
	timeoutMs: number,
	search: (signal: AbortSignal) => Promise<SearchResponse>,
): Promise<SearchResponse> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			search(controller.signal),
			new Promise<SearchResponse>((_, reject) => {
				timeout = setTimeout(() => {
					controller.abort();
					reject(
						new BridgeError(
							BRIDGE_REQUEST_UNSUPPORTED_TOOL,
							`web_search timed out after ${timeoutMs}ms.`,
							{
								provider: "web_search",
								model: "search",
								parameter: "web_search.timeout_ms",
								query: request.query,
							},
						),
					);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
