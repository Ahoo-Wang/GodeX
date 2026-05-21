import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import { enqueueEncoded } from "./stream-utils";

export class ResponseSseEncodeTransformer
	implements Transformer<ResponseStreamEvent, Uint8Array>
{
	private readonly encoder = new TextEncoder();
	private seq = 0;
	private terminalEmitted = false;

	transform(
		chunk: ResponseStreamEvent,
		controller: TransformStreamDefaultController<Uint8Array>,
	): void {
		if (this.terminalEmitted) return;
		const sequenceNumber = chunk.sequence_number ?? this.seq;
		this.seq = Math.max(this.seq, sequenceNumber + 1);
		enqueueEncoded(controller, this.encoder, sseEvent(chunk, sequenceNumber));
	}

	flush(controller: TransformStreamDefaultController<Uint8Array>): void {
		if (this.terminalEmitted) return;
		enqueueEncoded(controller, this.encoder, "data: [DONE]\n\n");
		this.terminalEmitted = true;
	}
}

function sseEvent(event: ResponseStreamEvent, seq: number): string {
	const payload = JSON.stringify({
		...event,
		sequence_number: event.sequence_number ?? seq,
	});
	return `event: ${event.type}\ndata: ${payload}\n\n`;
}
