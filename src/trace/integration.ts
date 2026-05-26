import type { ResponsesContext } from "../context/responses-context";
import type { ResponseUsage } from "../protocol/openai";
import { traceUsageFromResponseUsage } from "./usage";

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
	try {
		const current = ctx.app.promptCacheRequestAnalyzer.analyze({
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
		const detection = ctx.app.promptCacheDetector.detect({
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
		ctx.app.traceRecorder.record({
			kind: "request",
			request_id: ctx.requestId,
			response_id: ctx.responseId,
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			created_at: nowTraceMillis(),
			stream: ctx.request.stream === true,
			requested_prompt_cache_key: current.requested_prompt_cache_key,
			requested_prompt_cache_retention:
				current.requested_prompt_cache_retention,
			prompt_cache_key: current.prompt_cache_key,
			prompt_cache_retention: current.prompt_cache_retention,
			cache_detection: detection,
			payload: { payload: ctx.request },
		});
	} catch (err) {
		ctx.logger.warn("trace.prompt_cache_detection.error", () => ({
			request_id: ctx.requestId,
			error: String(err),
		}));
	}
}

export function recordTraceEvent(
	ctx: ResponsesContext,
	eventName:
		| "provider.request.body"
		| "provider.response.body"
		| "upstream.stream.event.raw"
		| "upstream.stream.event.transformed",
	payload: unknown,
	sequence?: number,
): void {
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
