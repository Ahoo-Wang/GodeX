import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import { StreamState } from "../mapper/stream-state";
import { responseFromTerminalEvent } from "./stream-utils";

export class ResponseLogTransformer extends SafeTransformer<
	ResponseStreamEvent,
	ResponseStreamEvent
> {
	private eventCount = 0;
	private logged = false;

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
		const state = StreamState.from(this.ctx);
		if (!state.completedAt) return;
		this.ctx.logger.info("responses.stream.completed", {
			status: state.finalStatus.status,
			model: this.ctx.resolved.model,
			streamEventCount: this.eventCount,
			durationMillis: Date.now() - this.ctx.createdAt * 1000,
			upstreamLatencyMillis: this.ctx.attributes.get("upstreamLatencyMillis"),
		});
		this.logged = true;
	}

	private logCompletion(chunk: ResponseStreamEvent): void {
		if (this.logged) return;
		const response = responseFromTerminalEvent(chunk);
		if (!response) return;
		this.ctx.logger.info("responses.stream.completed", {
			status: response.status,
			model: response.model,
			outputCount: response.output.length,
			durationMillis: Date.now() - this.ctx.createdAt * 1000,
			usage: response.usage,
			upstreamLatencyMillis: this.ctx.attributes.get("upstreamLatencyMillis"),
			streamEventCount: this.eventCount,
		});
		this.logged = true;
	}
}
