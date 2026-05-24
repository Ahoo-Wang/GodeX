import type { FetchExchange, ResultExtractor } from "@ahoo-wang/fetcher";
import type {
	JsonServerSentEventStream,
	ServerSentEvent,
	TerminateDetector,
} from "@ahoo-wang/fetcher-eventstream";
import type { ChatCompletionChunk } from "../../../protocol/openai/completions";

export const DoneDetector: TerminateDetector = (event: ServerSentEvent) => {
	return event.data === "[DONE]";
};

export const StreamResultExtractor: ResultExtractor<
	JsonServerSentEventStream<ChatCompletionChunk>
> = (exchange: FetchExchange) => {
	return exchange.requiredResponse.requiredJsonEventStream(DoneDetector);
};
