import type { ResponsesContext } from "../context/responses-context";
import type { ResponseStreamEvent } from "../protocol/openai/responses";
import {
	ProviderExchange,
	type ProviderStreamExchangeResult,
} from "./provider-exchange";
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

export interface StreamProviderExchange {
	stream(ctx: ResponsesContext): Promise<ProviderStreamExchangeResult>;
}

export class StreamPipeline {
	constructor(
		private readonly exchange: StreamProviderExchange = new ProviderExchange(),
		private readonly saveSession: typeof saveResponseSession = saveResponseSession,
	) {}

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
							saveSession: this.saveSession,
						}),
					);

		return pipeTransform(sessionStream, new CompatibilityLogTransformer(ctx));
	}
}
