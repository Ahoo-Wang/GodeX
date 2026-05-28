import type { TraceRecordingContext } from "./context";
import { nowTraceMillis } from "./time";

export function recordTraceRequest(
	ctx: TraceRecordingContext & { request?: { prompt_cache_key?: string } },
	stream: boolean,
	providerRequest?: unknown,
): void {
	if (!ctx.app.traceEnabled) return;
	ctx.app.traceRecorder.record({
		kind: "request",
		request_id: ctx.requestId,
		response_id: ctx.responseId,
		provider: ctx.resolved.provider,
		model: ctx.resolved.model,
		stream,
		created_at: nowTraceMillis(),
		requested_prompt_cache_key: ctx.request?.prompt_cache_key,
		payload:
			providerRequest === undefined ? undefined : { payload: providerRequest },
	});
}
