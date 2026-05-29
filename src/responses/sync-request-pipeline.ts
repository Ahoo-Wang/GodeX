import { reconstructResponseObject } from "../bridge/response";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseObject } from "../protocol/openai/responses";
import type { ResponseSessionStore } from "../session";
import { cacheHitRatioFromResponseUsage, recordTraceUsage } from "../trace";
import { logDiagnostics } from "./compatibility-diagnostics";
import {
	ProviderExchange,
	type ProviderRequestExchangeResult,
} from "./provider-exchange";
import { validateResponseOutputContract } from "./response-output-contract-validation";
import { responseRequestEchoFields } from "./response-request-echo";
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
		const { providerResponse, built } = await this.exchange.request(ctx);
		const completedAt = Math.floor(Date.now() / 1000);
		const response = reconstructResponseObject({
			requestId: ctx.requestId,
			responseId: ctx.responseId,
			createdAt: ctx.createdAt,
			completedAt,
			provider: ctx.provider.name,
			model: ctx.resolved.model,
			providerResponse,
			accessor: ctx.provider.spec.response,
			toolIdentity: built.tools,
			outputContract: built.output,
			echo: responseRequestEchoFields(ctx),
		});
		validateResponseOutputContract(ctx, ctx.outputContract.current(), response);
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
