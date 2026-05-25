import type { FetchExchange, ResultExtractor } from "@ahoo-wang/fetcher";
import type {
	JsonServerSentEventStream,
	ServerSentEvent,
	TerminateDetector,
} from "@ahoo-wang/fetcher-eventstream";

export const DoneDetector: TerminateDetector = (event: ServerSentEvent) => {
	return event.data === "[DONE]";
};

export const JsonStreamResultExtractor: ResultExtractor<
	JsonServerSentEventStream<unknown>
> = (exchange: FetchExchange) => {
	return exchange.requiredResponse.requiredJsonEventStream(DoneDetector);
};
