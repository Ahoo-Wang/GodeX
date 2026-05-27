import type { TraceRecordingContext } from "./context";
import { nowTraceMillis } from "./time";
import type { TraceEventRecordEvent } from "./types";

type TraceEventName = TraceEventRecordEvent["event_name"];

export function recordTraceEvent(
	ctx: TraceRecordingContext,
	eventName: TraceEventName,
	payload: unknown,
	sequence?: number,
): void {
	if (!ctx.app.traceEnabled) return;
	ctx.app.traceRecorder.record({
		kind: "event",
		request_id: ctx.requestId,
		response_id: ctx.responseId,
		provider: ctx.resolved.provider,
		model: ctx.resolved.model,
		created_at: nowTraceMillis(),
		event_name: eventName,
		sequence,
		payload: { payload },
	});
}
