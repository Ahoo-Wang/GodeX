import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";

export function pipeTransform<I, O>(
	stream: ReadableStream<I>,
	transformer: Transformer<I, O>,
): ReadableStream<O> {
	return stream.pipeThrough(new TransformStream(transformer));
}

export const ATTR_UPSTREAM_LATENCY_MILLIS = "upstreamLatencyMillis";

export function responseFromTerminalEvent(
	chunk: ResponseStreamEvent,
): ResponseObject | null {
	if (
		chunk.type !== "response.completed" &&
		chunk.type !== "response.incomplete" &&
		chunk.type !== "response.failed"
	) {
		return null;
	}
	return chunk.response ?? null;
}
