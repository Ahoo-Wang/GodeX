import type { ResponsesContext } from "../context/responses-context";
import type { ResponseObject } from "../protocol/openai/responses";
import type { ResponseSessionStore } from "../session";
import { cacheHitRatioFromResponseUsage, recordTraceUsage } from "../trace";
import { logDiagnostics } from "./compatibility";
import {
	ProviderExchange,
	type ProviderRequestExchangeResult,
} from "./provider-exchange";
import { saveResponseSession } from "./response-session-persistence";

export interface SyncProviderExchange {
	request(ctx: ResponsesContext): Promise<ProviderRequestExchangeResult>;
}

export type SaveResponseSession = (
	store: ResponseSessionStore,
	responseObject: ResponseObject,
	ctx: ResponsesContext,
) => Promise<void>;

export class SyncRequestPipeline {
	constructor(
		private readonly exchange: SyncProviderExchange = new ProviderExchange(),
		private readonly saveSession: SaveResponseSession = saveResponseSession,
	) {}

	async request(ctx: ResponsesContext): Promise<ResponseObject> {
		const { providerResponse } = await this.exchange.request(ctx);
		const response = await ctx.provider.mapper.response.map(
			ctx,
			providerResponse,
		);
		recordTraceUsage(ctx, response.usage);
		ctx.logger.info("responses.request.completed", () => ({
			status: response.status,
			model: response.model,
			outputCount: response.output.length,
			durationMillis: Date.now() - ctx.createdAt * 1000,
			usage: response.usage,
			cacheHitRatio: cacheHitRatioFromResponseUsage(response.usage),
		}));
		logDiagnostics(ctx, {
			durationMillis: Date.now() - ctx.createdAt * 1000,
		});
		try {
			await this.saveSession(ctx.app.sessionStore, response, ctx);
		} catch (err) {
			ctx.logger.warn("session.save.error", () => ({
				request_id: ctx.requestId,
				response_id: response.id,
				error: String(err),
			}));
		}
		return response;
	}
}
