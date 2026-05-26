import {
	type JsonServerSentEvent,
	SafeTransformer,
} from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import { StreamResponseState } from "../mapper/chat/stream-response-state";
import type { StreamMapper } from "../mapper/contract";

export class ProviderEventToResponseTransformer extends SafeTransformer<
	JsonServerSentEvent<unknown>,
	ResponseStreamEvent
> {
	private lastController?: TransformStreamDefaultController<ResponseStreamEvent>;

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
		this.lastController = controller;
		for (const responseEvent of await this.mapper.map(this.ctx, event)) {
			this.enqueue(controller, responseEvent);
		}
	}

	protected override async onFlush(): Promise<void> {
		const state = StreamResponseState.get(this.ctx);
		if (!state) return;
		const events = state.finalize();
		if (this.lastController) {
			for (const event of events) {
				this.enqueue(this.lastController, event);
			}
		}
	}
}
