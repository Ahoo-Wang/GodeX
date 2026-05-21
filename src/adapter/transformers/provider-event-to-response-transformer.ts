import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import type { StreamMapper } from "../mapper/contract";
import { enqueue } from "./stream-utils";

export class ProviderEventToResponseTransformer
	implements Transformer<JsonServerSentEvent<unknown>, ResponseStreamEvent>
{
	constructor(
		private readonly mapper: StreamMapper<unknown>,
		private readonly ctx: ResponsesContext,
	) {}

	async transform(
		event: JsonServerSentEvent<unknown>,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): Promise<void> {
		for (const responseEvent of await this.mapper.map(this.ctx, event)) {
			enqueue(controller, responseEvent);
		}
	}
}
