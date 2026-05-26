import type { ResponsesContext } from "../context/responses-context";
import {
	ADAPTER_STREAM_DELTA_AFTER_TERMINAL,
	ADAPTER_STREAM_INCOMPLETE_TOOL_CALL,
	ADAPTER_STREAM_INVALID_TRANSITION,
	ADAPTER_STREAM_MISSING_OUTPUT_BLOCK,
	ADAPTER_STREAM_OUTPUT_BEFORE_START,
} from "../error/codes";
import { GodeXError } from "../error/godex-error";
import type { ResponseStreamEvent } from "../protocol/openai/responses";
import { StreamResponseState } from "./mapper/chat/stream-response-state";

const KNOWN_STREAM_CODES = new Set([
	ADAPTER_STREAM_DELTA_AFTER_TERMINAL,
	ADAPTER_STREAM_INCOMPLETE_TOOL_CALL,
	ADAPTER_STREAM_INVALID_TRANSITION,
	ADAPTER_STREAM_MISSING_OUTPUT_BLOCK,
	ADAPTER_STREAM_OUTPUT_BEFORE_START,
]);

/**
 * Wraps a ResponseStreamEvent stream so that read errors trigger a
 * response.failed event before the stream closes.
 *
 * If onError itself fails with a known stream lifecycle error (already
 * terminal, invalid transition, etc.), the exception is expected and
 * logged at debug level. Unexpected failures are logged at warn level.
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
						if (e instanceof GodeXError && KNOWN_STREAM_CODES.has(e.code)) {
							ctx.logger.debug("stream.error.handler.expected", () => ({
								code: e.code,
								error: e.message,
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
