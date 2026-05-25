import type { FetchExchange, ResultExtractor } from "@ahoo-wang/fetcher";
import type {
	JsonServerSentEventStream,
	ServerSentEvent,
	TerminateDetector,
} from "@ahoo-wang/fetcher-eventstream";

export const DoneDetector: TerminateDetector = (event: ServerSentEvent) => {
	return event.data === "[DONE]";
};

export function createStreamResultExtractor<T>(): ResultExtractor<
	JsonServerSentEventStream<T>
> {
	return (exchange: FetchExchange) => {
		return exchange.requiredResponse.requiredJsonEventStream(DoneDetector);
	};
}
