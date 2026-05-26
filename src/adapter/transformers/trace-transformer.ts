import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import { recordTraceEvent } from "../../trace";

export class TraceTransformer<T> extends SafeTransformer<T, T> {
	private sequence = 0;

	constructor(
		private readonly eventName: string,
		private readonly ctx: ResponsesContext,
	) {
		super();
	}

	protected async onTransform(
		chunk: T,
		controller: TransformStreamDefaultController<T>,
	): Promise<void> {
		this.enqueue(controller, chunk);
		recordTraceEvent(this.ctx, this.eventName as never, chunk, ++this.sequence);
	}
}
