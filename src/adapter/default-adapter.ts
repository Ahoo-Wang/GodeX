import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { Adapter } from "./adapter";
import { ProviderExchange } from "./provider-exchange";
import { StreamPipeline } from "./stream-pipeline";
import { SyncRequestPipeline } from "./sync-request-pipeline";

export interface AdapterSyncPipeline {
	request(ctx: ResponsesContext): Promise<ResponseObject>;
}

export interface AdapterStreamPipeline {
	stream(ctx: ResponsesContext): Promise<ReadableStream<ResponseStreamEvent>>;
}

export class DefaultAdapter implements Adapter {
	private readonly syncPipeline: AdapterSyncPipeline;
	private readonly streamPipeline: AdapterStreamPipeline;

	constructor(
		syncPipeline?: AdapterSyncPipeline,
		streamPipeline?: AdapterStreamPipeline,
	) {
		const exchange = new ProviderExchange();
		this.syncPipeline = syncPipeline ?? new SyncRequestPipeline(exchange);
		this.streamPipeline = streamPipeline ?? new StreamPipeline(exchange);
	}

	async request(ctx: ResponsesContext): Promise<ResponseObject> {
		return this.syncPipeline.request(ctx);
	}

	async stream(
		ctx: ResponsesContext,
	): Promise<ReadableStream<ResponseStreamEvent>> {
		return this.streamPipeline.stream(ctx);
	}
}
