import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { Adapter } from "./adapter";
import { ProviderExchange } from "./provider-exchange";
import { saveResponseSession } from "./response-session-persistence";
import { wrapWithErrorHandler } from "./stream-error-handler";
import { SyncRequestPipeline } from "./sync-request-pipeline";
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
	private readonly syncPipeline = new SyncRequestPipeline(this.exchange);

	async request(ctx: ResponsesContext): Promise<ResponseObject> {
		return this.syncPipeline.request(ctx);
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
