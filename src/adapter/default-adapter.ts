import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { Adapter } from "./adapter";
import { ProviderExchange } from "./provider-exchange";
import { StreamPipeline } from "./stream-pipeline";
import { SyncRequestPipeline } from "./sync-request-pipeline";

export class DefaultAdapter implements Adapter {
	private readonly exchange = new ProviderExchange();
	private readonly syncPipeline = new SyncRequestPipeline(this.exchange);
	private readonly streamPipeline = new StreamPipeline(this.exchange);

	async request(ctx: ResponsesContext): Promise<ResponseObject> {
		return this.syncPipeline.request(ctx);
	}

	async stream(
		ctx: ResponsesContext,
	): Promise<ReadableStream<ResponseStreamEvent>> {
		return this.streamPipeline.stream(ctx);
	}
}
