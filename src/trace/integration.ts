import type { ResponsesContext } from "../context/responses-context";
import type { ResponseUsage } from "../protocol/openai";
import type {
	PromptCacheAnalysisInput,
	PromptCacheDetection,
	TraceEventRecordEvent,
	TraceRequestRecordEvent,
} from "./types";
import { traceUsageFromResponseUsage } from "./usage";

type TraceEventName = TraceEventRecordEvent["event_name"];

export function nowTraceMillis(): number {
	return Date.now();
}

export function cacheIdentityKey(input: {
	requested_prompt_cache_key?: string;
	prompt_cache_key?: string;
}): string | undefined {
	return input.requested_prompt_cache_key ?? input.prompt_cache_key;
}

export function analyzePromptCache(
	ctx: ResponsesContext,
	providerRequest: unknown,
): void {
	if (!ctx.app.traceEnabled) return;
	let current: PromptCacheAnalysisInput | undefined;
	let detection: PromptCacheDetection | undefined;
	try {
		current = ctx.app.promptCacheRequestAnalyzer.analyze({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			request: ctx.request,
			providerRequest,
		});
		const key = cacheIdentityKey(current);
		const previous = ctx.app.promptCacheObservationIndex.get({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			cache_identity_key: key,
		});
		detection = ctx.app.promptCacheDetector.detect({
			current,
			previous,
		});
		if (key) {
			ctx.app.promptCacheObservationIndex.remember({
				provider: ctx.resolved.provider,
				model: ctx.resolved.model,
				cache_identity_key: key,
				prefix_hash: detection.prefix_hash,
				prefix_bytes: detection.prefix_bytes,
				tool_fingerprint: detection.tool_fingerprint,
				created_at: nowTraceMillis(),
				request_id: ctx.requestId,
			});
		}
	} catch (err) {
		ctx.logger.warn("trace.prompt_cache_detection.error", () => ({
			request_id: ctx.requestId,
			error: String(err),
		}));
	}
	recordTraceRequest(ctx, current, detection);
}

function recordTraceRequest(
	ctx: ResponsesContext,
	current?: PromptCacheAnalysisInput,
	detection?: PromptCacheDetection,
): void {
	const record: TraceRequestRecordEvent = {
		kind: "request",
		request_id: ctx.requestId,
		response_id: ctx.responseId,
		provider: ctx.resolved.provider,
		model: ctx.resolved.model,
		created_at: nowTraceMillis(),
		stream: ctx.request.stream === true,
		payload: { payload: ctx.request },
	};
	if (current?.requested_prompt_cache_key !== undefined) {
		record.requested_prompt_cache_key = current.requested_prompt_cache_key;
	}
	if (current?.requested_prompt_cache_retention !== undefined) {
		record.requested_prompt_cache_retention =
			current.requested_prompt_cache_retention;
	}
	if (current?.prompt_cache_key !== undefined) {
		record.prompt_cache_key = current.prompt_cache_key;
	}
	if (current?.prompt_cache_retention !== undefined) {
		record.prompt_cache_retention = current.prompt_cache_retention;
	}
	if (detection) {
		record.cache_detection = detection;
	}
	ctx.app.traceRecorder.record(record);
}

export function recordTraceEvent(
	ctx: ResponsesContext,
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

export function recordTraceUsage(
	ctx: Pick<ResponsesContext, "requestId" | "responseId" | "resolved" | "app">,
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
