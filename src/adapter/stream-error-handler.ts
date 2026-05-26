import type { ResponsesContext } from "../context/responses-context";
import type { ResponseStreamEvent } from "../protocol/openai/responses";
import { StreamResponseState } from "./mapper/chat/stream-response-state";

/**
 * Wraps a ResponseStreamEvent stream so that read errors trigger a
 * response.failed event before the stream closes.
 *
 * If onError itself fails because the stream is already terminal,
 * the exception is expected and logged at debug level. Unexpected
 * failures are logged at warn level for diagnostics.
 */
export function wrapWithErrorHandler(
	stream: ReadableStream<ResponseStreamEvent>,
	ctx: ResponsesContext,
): ReadableStream<ResponseStreamEvent> {
	return new ReadableStream<ResponseStreamEvent>({
		async start(controller) {
			const reader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}
				controller.close();
			} catch (err) {
				const state = StreamResponseState.get(ctx);
				if (state) {
					try {
						for (const e of state.onError({
							code: "server_error",
							message: String(err),
						})) {
							controller.enqueue(e);
						}
					} catch (e) {
						const isKnown =
							e instanceof Error &&
							e.message.includes("stream response phase is");
						if (isKnown) {
							ctx.logger.debug("stream.error.handler.already_terminal", () => ({
								error: String(e),
							}));
						} else {
							ctx.logger.warn("stream.error.handler.failed", () => ({
								error: String(e),
							}));
						}
					}
				}
				controller.close();
			}
		},
	});
}
