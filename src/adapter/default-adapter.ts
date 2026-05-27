import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import { recordTraceUsage } from "../trace";
import type { Adapter } from "./adapter";
import { logDiagnostics } from "./compatibility";
import { ProviderExchange } from "./provider-exchange";
import { saveResponseSession } from "./response-session-persistence";
import { wrapWithErrorHandler } from "./stream-error-handler";
import { CompatibilityLogTransformer } from "./transformers/compatibility-log-transformer";
import { ProviderEventToResponseTransformer } from "./transformers/provider-event-to-response-transformer";
import { ResponseLogTransformer } from "./transformers/response-log-transformer";
import { ResponseSessionPersistenceTransformer } from "./transformers/response-session-persistence-transformer";
import {
	ATTR_UPSTREAM_LATENCY_MILLIS,
	pipeTransform,
} from "./transformers/stream-utils";
import { TraceTransformer } from "./transformers/trace-transformer";

export class DefaultAdapter implements Adapter {
	private readonly exchange = new ProviderExchange();

	async request(ctx: ResponsesContext): Promise<ResponseObject> {
		const { providerResponse } = await this.exchange.request(ctx);
		const response = await ctx.provider.mapper.response.map(ctx, providerResponse);
		recordTraceUsage(
			ctx,
			response.usage,
			(providerResponse as { usage?: unknown })?.usage,
		);
		ctx.logger.info("responses.request.completed", () => ({
			status: response.status,
			model: response.model,
			outputCount: response.output.length,
			durationMillis: Date.now() - ctx.createdAt * 1000,
			usage: response.usage,
		}));
		logDiagnostics(ctx, {
			durationMillis: Date.now() - ctx.createdAt * 1000,
		});
		try {
			await saveResponseSession(ctx.app.sessionStore, response, ctx);
		} catch (err) {
			ctx.logger.warn("session.save.error", () => ({
				request_id: ctx.requestId,
				response_id: response.id,
				error: String(err),
			}));
		}
		return response;
	}

	async stream(
		ctx: ResponsesContext,
	): Promise<ReadableStream<ResponseStreamEvent>> {
		const { mapper, providerStream, upstreamLatencyMillis } =
			await this.exchange.stream(ctx);
		ctx.attributes.set(ATTR_UPSTREAM_LATENCY_MILLIS, upstreamLatencyMillis);

		const traceRawStream = pipeTransform(
			providerStream,
			new TraceTransformer("upstream.stream.event.raw", ctx),
		);

		const eventStream = pipeTransform(
			traceRawStream,
			new ProviderEventToResponseTransformer(mapper.stream, ctx),
		);

		const errorSafeStream = wrapWithErrorHandler(eventStream, ctx);

		const traceTransformedStream = pipeTransform(
			errorSafeStream,
			new TraceTransformer("upstream.stream.event.transformed", ctx),
		);

		const logStream = pipeTransform(
			traceTransformedStream,
			new ResponseLogTransformer(ctx),
		);

		const sessionStream =
			ctx.request.store === false
				? logStream
					: pipeTransform(
						logStream,
						new ResponseSessionPersistenceTransformer({
							ctx,
							saveSession: saveResponseSession,
						}),
					);

		return pipeTransform(sessionStream, new CompatibilityLogTransformer(ctx));
	}
}
