/*
 * Copyright [2021-present] [ahoo wang <ahoowang@qq.com> (https://github.com/Ahoo-Wang)].
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *      http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { FetchExchange, ResultExtractor } from "@ahoo-wang/fetcher";
import "@ahoo-wang/fetcher-eventstream";
import type {
	JsonServerSentEventStream,
	ServerSentEvent,
	TerminateDetector,
} from "@ahoo-wang/fetcher-eventstream";
import type { ChatCompletionChunk } from "../protocol";

/**
 * A termination detector for OpenAI chat completion streams.
 *
 * This detector identifies when a chat completion stream has finished by checking
 * if the server-sent event data equals '[DONE]'. This is the standard completion
 * signal used by OpenAI's API for streaming chat completions.
 *
 * @param event - The server-sent event to evaluate for termination
 * @returns true if the event indicates stream completion, false otherwise
 *
 * @example
 * ```typescript
 * const event: ServerSentEvent = { data: '[DONE]', event: 'done' };
 * const isDone = DoneDetector(event); // returns true
 * ```
 */
export const DoneDetector: TerminateDetector = (event: ServerSentEvent) => {
	return event.data === "[DONE]";
};

export const StreamResultExtractor: ResultExtractor<
	JsonServerSentEventStream<ChatCompletionChunk>
> = (exchange: FetchExchange) => {
	return exchange.requiredResponse.requiredJsonEventStream(DoneDetector);
};
