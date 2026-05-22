import {
	type JsonServerSentEvent,
	SafeTransformer,
} from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import type { StreamMapper } from "../mapper/contract";

export class ProviderEventToResponseTransformer extends SafeTransformer<
	JsonServerSentEvent<unknown>,
	ResponseStreamEvent
> {
	constructor(
		private readonly mapper: StreamMapper<unknown>,
		private readonly ctx: ResponsesContext,
	) {
		super();
	}

	protected async onTransform(
		event: JsonServerSentEvent<unknown>,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): Promise<void> {
		for (const responseEvent of await this.mapper.map(this.ctx, event)) {
			this.enqueue(controller, responseEvent);
		}
	}
}
