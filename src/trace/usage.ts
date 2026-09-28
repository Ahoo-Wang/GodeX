import type { ResponseUsage } from "../protocol/openai";
import type { TraceUsageSnapshot } from "./types";

export function traceUsageFromResponseUsage(
	usage: ResponseUsage | null | undefined,
): TraceUsageSnapshot | null {
	if (!usage) return null;
	const cachedTokens = usage.input_tokens_details?.cached_tokens;
	const reasoningTokens = usage.output_tokens_details?.reasoning_tokens;
	const result: TraceUsageSnapshot = {
		input_tokens: usage.input_tokens,
		output_tokens: usage.output_tokens,
		total_tokens: usage.total_tokens,
		...(cachedTokens !== undefined ? { cached_tokens: cachedTokens } : {}),
		...(reasoningTokens !== undefined
			? { reasoning_tokens: reasoningTokens }
			: {}),
	};
	if (cachedTokens !== undefined && usage.input_tokens > 0) {
		result.cache_hit_ratio = cachedTokens / usage.input_tokens;
	}
	return result;
}

export function cacheHitRatioFromResponseUsage(
	usage: ResponseUsage | null | undefined,
): number | undefined {
	const cachedTokens = usage?.input_tokens_details?.cached_tokens;
	if (cachedTokens === undefined || !usage || usage.input_tokens <= 0) {
		return undefined;
	}
	return cachedTokens / usage.input_tokens;
}
