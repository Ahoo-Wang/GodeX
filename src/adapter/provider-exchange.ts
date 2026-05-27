import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../context/responses-context";
import { analyzePromptCache, recordTraceEvent } from "../trace";

export interface ProviderRequestExchangeResult<ProviderResponse = unknown> {
	providerResponse: ProviderResponse;
}

export interface ProviderStreamExchangeResult {
	mapper: ResponsesContext["provider"]["mapper"];
	providerStream: ReadableStream<JsonServerSentEvent<unknown>>;
	upstreamLatencyMillis: number;
}

export class ProviderExchange {
	async request(ctx: ResponsesContext): Promise<ProviderRequestExchangeResult> {
		const { mapper, client } = ctx.provider;
		const providerRequest = await mapper.request.map(ctx);
		analyzePromptCache(ctx, providerRequest);
		recordTraceEvent(ctx, "provider.request.body", providerRequest);
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: false,
		}));

		const upstreamStart = Date.now();
		const providerResponse = await client.request(providerRequest);
		recordTraceEvent(ctx, "provider.response.body", providerResponse);
		ctx.logger.debug("provider.response.received", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			upstreamDurationMillis: Date.now() - upstreamStart,
		}));

		return { providerResponse };
	}

	async stream(ctx: ResponsesContext): Promise<ProviderStreamExchangeResult> {
		const { mapper, client } = ctx.provider;
		const providerRequest = await mapper.request.map(ctx);
		analyzePromptCache(ctx, providerRequest);
		recordTraceEvent(ctx, "provider.request.body", providerRequest);
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: true,
		}));

		const upstreamStart = Date.now();
		const providerStream = await client.stream(providerRequest);
		const upstreamLatencyMillis = Date.now() - upstreamStart;
		ctx.logger.debug("provider.stream.connected", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			upstreamLatencyMillis,
		}));

		return { mapper, providerStream, upstreamLatencyMillis };
	}
}
