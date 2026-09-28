import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";

export class ResponseSseEncoder extends SafeTransformer<
	ResponseStreamEvent,
	Uint8Array
> {
	private readonly encoder = new TextEncoder();
	private seq = 0;

	protected onTransform(
		chunk: ResponseStreamEvent,
		controller: TransformStreamDefaultController<Uint8Array>,
	): void {
		const sequenceNumber = chunk.sequence_number ?? this.seq;
		this.seq = Math.max(this.seq, sequenceNumber + 1);
		this.enqueue(
			controller,
			this.encoder.encode(sseEvent(chunk, sequenceNumber)),
		);
	}
}

function sseEvent(event: ResponseStreamEvent, seq: number): string {
	const payload = JSON.stringify({
		...event,
		sequence_number: event.sequence_number ?? seq,
	});
	return `event: ${event.type}\ndata: ${payload}\n\n`;
}
