import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponsesBridge } from "./bridge";
import { ProviderExchange } from "./provider-exchange";
import { StreamPipeline } from "./stream-pipeline";
import { SyncRequestPipeline } from "./sync-request-pipeline";

export interface ResponsesSyncPipeline {
	request(ctx: ResponsesContext): Promise<ResponseObject>;
}

export interface ResponsesStreamPipeline {
	stream(ctx: ResponsesContext): Promise<ReadableStream<ResponseStreamEvent>>;
}

export class ResponsesBridgeRuntime implements ResponsesBridge {
	private readonly syncPipeline: ResponsesSyncPipeline;
	private readonly streamPipeline: ResponsesStreamPipeline;

	constructor(
		syncPipeline?: ResponsesSyncPipeline,
		streamPipeline?: ResponsesStreamPipeline,
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
