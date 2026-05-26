import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import { recordTraceEvent } from "../../trace";
import type { TraceEventRecordEvent } from "../../trace/types";

type TraceEventName = TraceEventRecordEvent["event_name"];

export class TraceTransformer<T> extends SafeTransformer<T, T> {
	private sequence = 0;

	constructor(
		private readonly eventName: TraceEventName,
		private readonly ctx: ResponsesContext,
	) {
		super();
	}

	protected async onTransform(
		chunk: T,
		controller: TransformStreamDefaultController<T>,
	): Promise<void> {
		this.enqueue(controller, chunk);
		if (!this.ctx.app.traceEnabled) return;
		++this.sequence;
		recordTraceEvent(this.ctx, this.eventName, chunk, this.sequence);
	}
}
