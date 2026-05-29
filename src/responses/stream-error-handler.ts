import {
	type ProviderStreamError,
	ResponseStreamPhase,
	type ResponseStreamStateMachine,
} from "../bridge/stream";
import type { ResponsesContext } from "../context/responses-context";
import {
	BRIDGE_STREAM_DELTA_AFTER_TERMINAL,
	BRIDGE_STREAM_INCOMPLETE_TOOL_CALL,
	BRIDGE_STREAM_INVALID_TRANSITION,
	BRIDGE_STREAM_MISSING_OUTPUT_BLOCK,
	BRIDGE_STREAM_OUTPUT_BEFORE_START,
} from "../error/codes";
import { GodeXError } from "../error/godex-error";
import type { ResponseStreamEvent } from "../protocol/openai/responses";
import { recordTraceError } from "../trace";

const KNOWN_STREAM_CODES = new Set([
	BRIDGE_STREAM_DELTA_AFTER_TERMINAL,
	BRIDGE_STREAM_INCOMPLETE_TOOL_CALL,
	BRIDGE_STREAM_INVALID_TRANSITION,
	BRIDGE_STREAM_MISSING_OUTPUT_BLOCK,
	BRIDGE_STREAM_OUTPUT_BEFORE_START,
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
	machine: ResponseStreamStateMachine,
	ctx: ResponsesContext,
): ReadableStream<ResponseStreamEvent> {
	let reader:
		| ReturnType<ReadableStream<ResponseStreamEvent>["getReader"]>
		| undefined;
	let cancelled = false;
	let released = false;
	const releaseReader = () => {
		if (!reader || released) return;
		reader.releaseLock();
		released = true;
	};
	return new ReadableStream<ResponseStreamEvent>({
		async start(controller) {
			const activeReader = stream.getReader();
			reader = activeReader;
			try {
				while (true) {
					const { done, value } = await activeReader.read();
					if (done) break;
					if (cancelled) break;
					controller.enqueue(value);
				}
				if (!cancelled) controller.close();
			} catch (err) {
				if (cancelled) return;
				recordTraceError(ctx, "upstream.stream.error", err);
				if (
					machine.phase === ResponseStreamPhase.IDLE ||
					machine.phase === ResponseStreamPhase.IN_PROGRESS
				) {
					try {
						if (machine.phase === ResponseStreamPhase.IDLE) {
							for (const e of machine.start()) {
								controller.enqueue(e);
							}
						}
						for (const e of machine.fail(providerStreamError(err))) {
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
			} finally {
				releaseReader();
			}
		},
		async cancel(reason) {
			cancelled = true;
			try {
				await reader?.cancel(reason);
			} finally {
				releaseReader();
			}
		},
	});
}

function providerStreamError(err: unknown): ProviderStreamError {
	return {
		code: "server_error",
		message: String(err),
	};
}
