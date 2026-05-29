import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import {
	mapProviderDeltasToEvents,
	ResponseStreamPhase,
	ResponseStreamStateMachine,
} from "../bridge/stream";
import { ToolIdentityMap } from "../bridge/tools";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseStreamEvent } from "../protocol/openai/responses";
import {
	ProviderExchange,
	type ProviderStreamExchangeResult,
} from "./provider-exchange";
import { responseRequestEchoFields } from "./response-request-echo";
import { saveResponseSession } from "./response-session-persistence";
import { wrapWithErrorHandler } from "./stream-error-handler";
import { CompatibilityLogTransformer } from "./stream-transforms/compatibility-log-transformer";
import { ResponseLogTransformer } from "./stream-transforms/response-log-transformer";
import { ResponseOutputContractValidationTransformer } from "./stream-transforms/response-output-contract-validation-transformer";
import { ResponseSessionPersistenceTransformer } from "./stream-transforms/response-session-persistence-transformer";
import {
	ATTR_UPSTREAM_LATENCY_MILLIS,
	pipeTransform,
} from "./stream-transforms/stream-utils";
import { TraceTransformer } from "./stream-transforms/trace-transformer";

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
		const { providerStream, upstreamLatencyMillis, built } =
			await this.exchange.stream(ctx);
		ctx.attributes.set(ATTR_UPSTREAM_LATENCY_MILLIS, upstreamLatencyMillis);

		const traceRawStream = pipeTransform(
			providerStream,
			new TraceTransformer("upstream.stream.event.raw", ctx),
		);

		const eventBridge = new ProviderStreamEventBridge(ctx, built);
		const eventStream = pipeTransform(traceRawStream, eventBridge);

		const errorSafeStream = wrapWithErrorHandler(
			eventStream,
			eventBridge.machine,
			ctx,
		);

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

class ProviderStreamEventBridge
	implements Transformer<JsonServerSentEvent<unknown>, ResponseStreamEvent>
{
	readonly machine: ResponseStreamStateMachine;

	constructor(
		private readonly ctx: ResponsesContext,
		built: ProviderStreamExchangeResult["built"],
	) {
		const toolIdentities = new ToolIdentityMap();
		toolIdentities.addDeclarations(built.tools.declarations);
		this.machine = new ResponseStreamStateMachine({
			responseId: ctx.responseId,
			createdAt: ctx.createdAt,
			model: ctx.resolved.model,
			provider: ctx.provider.name,
			toolIdentities,
			echo: responseRequestEchoFields(ctx),
		});
	}

	transform(
		event: JsonServerSentEvent<unknown>,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): void {
		const deltas = this.ctx.provider.spec.stream.deltas(event.data);
		for (const responseEvent of mapProviderDeltasToEvents({
			machine: this.machine,
			deltas,
			deferTerminal: true,
		})) {
			controller.enqueue(responseEvent);
		}
	}

	flush(
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): void {
		if (this.machine.phase !== ResponseStreamPhase.IN_PROGRESS) return;
		for (const responseEvent of this.machine.finish(
			this.machine.deferredFinishReason,
		)) {
			controller.enqueue(responseEvent);
		}
	}
}
