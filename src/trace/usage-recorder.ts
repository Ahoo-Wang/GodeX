import type { ResponseUsage } from "../protocol/openai";
import type { TraceRecordingContext } from "./context";
import { nowTraceMillis } from "./time";
import { traceUsageFromResponseUsage } from "./usage";

export function recordTraceUsage(
	ctx: TraceRecordingContext,
	usage: ResponseUsage | null | undefined,
	rawUsage?: unknown,
): void {
	if (!ctx.app.traceEnabled) return;
	const snapshot = traceUsageFromResponseUsage(usage, rawUsage);
	if (!snapshot) return;
	ctx.app.traceRecorder.record({
		kind: "usage",
		request_id: ctx.requestId,
		response_id: ctx.responseId,
		provider: ctx.resolved.provider,
		model: ctx.resolved.model,
		created_at: nowTraceMillis(),
		usage: snapshot,
		raw_usage: rawUsage,
	});
}
