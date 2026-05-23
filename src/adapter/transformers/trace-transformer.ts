import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";

export class TraceTransformer<T> extends SafeTransformer<T, T> {
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
		this.ctx.logger.trace(this.eventName, { data: chunk });
		this.enqueue(controller, chunk);
	}
}
