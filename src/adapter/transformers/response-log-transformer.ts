import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import { recordTraceUsage } from "../../trace";
import {
	StreamResponsePhase,
	StreamResponseState,
} from "../mapper/chat/stream-response-state";
import {
	ATTR_UPSTREAM_LATENCY_MILLIS,
	responseFromTerminalEvent,
} from "./stream-utils";

export class ResponseLogTransformer extends SafeTransformer<
	ResponseStreamEvent,
	ResponseStreamEvent
> {
	private eventCount = 0;
	private logged = false;
	private usageRecorded = false;

	constructor(private readonly ctx: ResponsesContext) {
		super();
	}

	protected async onTransform(
		chunk: ResponseStreamEvent,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): Promise<void> {
		this.eventCount++;
		this.enqueue(controller, chunk);
		this.logCompletion(chunk);
	}

	protected override async onFlush(): Promise<void> {
		if (this.logged) return;
		const state = StreamResponseState.get(this.ctx);

		if (!state) return;
		if (
			state.phase !== StreamResponsePhase.COMPLETED &&
			state.phase !== StreamResponsePhase.INCOMPLETE &&
			state.phase !== StreamResponsePhase.FAILED
		) {
			return;
		}
		this.recordUsage(state.snapshot);
		const outputCount = state.snapshot.output.length;
		this.ctx.logger.info("responses.stream.completed", () => ({
			status: state.snapshot.status,
			model: this.ctx.resolved.model,
			outputCount,
			durationMillis: Date.now() - this.ctx.createdAt * 1000,
			upstreamLatencyMillis: this.ctx.attributes.get(
				ATTR_UPSTREAM_LATENCY_MILLIS,
			),
			streamEventCount: this.eventCount,
		}));
		this.logged = true;
	}

	private logCompletion(chunk: ResponseStreamEvent): void {
		if (this.logged) return;
		const response = responseFromTerminalEvent(chunk);
		if (!response) return;
		this.recordUsage(response);
		this.ctx.logger.info("responses.stream.completed", () => ({
			status: response.status,
			model: response.model,
			outputCount: response.output.length,
			durationMillis: Date.now() - this.ctx.createdAt * 1000,
			usage: response.usage,
			upstreamLatencyMillis: this.ctx.attributes.get(
				ATTR_UPSTREAM_LATENCY_MILLIS,
			),
			streamEventCount: this.eventCount,
		}));
		this.logged = true;
	}

	private recordUsage(response: ResponseObject): void {
		if (this.usageRecorded) return;
		if (!response.usage) return;
		recordTraceUsage(this.ctx, response.usage);
		this.usageRecorded = true;
	}
}
