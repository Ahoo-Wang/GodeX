import type { ResponsesContext } from "../context/responses-context";
import type { ResponseStreamEvent } from "../protocol/openai/responses";
import {
	ProviderExchange,
	type ProviderExchangeStreamOptions,
	type ProviderStreamExchangeResult,
} from "./provider-exchange";
import { saveResponseSession } from "./response-session-persistence";
import { wrapWithErrorHandler } from "./stream-error-handler";
import { CompatibilityLogTransformer } from "./stream-transforms/compatibility-log-transformer";
import { ResponseLogTransformer } from "./stream-transforms/response-log-transformer";
import { ResponseOutputContractValidationTransformer } from "./stream-transforms/response-output-contract-validation-transformer";
import { ResponseSessionPersistenceTransformer } from "./stream-transforms/response-session-persistence-transformer";
import { pipeTransform } from "./stream-transforms/stream-utils";
import { TraceTransformer } from "./stream-transforms/trace-transformer";
import { HostedWebSearchStreamRunner } from "./web-search";

export interface StreamProviderExchange {
	stream(
		ctx: ResponsesContext,
		options?: ProviderExchangeStreamOptions,
	): Promise<ProviderStreamExchangeResult>;
}

export class StreamPipeline {
	constructor(
		private readonly exchange: StreamProviderExchange = new ProviderExchange(),
		private readonly saveSession: typeof saveResponseSession = saveResponseSession,
	) {}

	async stream(
		ctx: ResponsesContext,
	): Promise<ReadableStream<ResponseStreamEvent>> {
		const { stream: eventStream, machine } =
			await new HostedWebSearchStreamRunner(this.exchange).stream(ctx);

		const errorSafeStream = wrapWithErrorHandler(eventStream, machine, ctx);

		const validatedStream = pipeTransform(
			errorSafeStream,
			new ResponseOutputContractValidationTransformer(ctx),
		);

		const traceTransformedStream = pipeTransform(
			validatedStream,
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
