import type { ResponseUsage } from "../protocol/openai";
import type { TraceUsageSnapshot } from "./types";

function numberField(source: unknown, field: string): number | undefined {
	if (!source || typeof source !== "object") return undefined;
	const value = (source as Record<string, unknown>)[field];
	return typeof value === "number" ? value : undefined;
}

export function traceUsageFromResponseUsage(
	usage: ResponseUsage | null | undefined,
	rawUsage?: unknown,
): TraceUsageSnapshot | null {
	if (!usage) return null;
	const cachedTokens = usage.input_tokens_details?.cached_tokens;
	const result: TraceUsageSnapshot = {
		input_tokens: usage.input_tokens,
		output_tokens: usage.output_tokens,
		total_tokens: usage.total_tokens,
		...(cachedTokens !== undefined ? { cached_tokens: cachedTokens } : {}),
	};
	if (cachedTokens !== undefined && usage.input_tokens > 0) {
		result.cache_hit_ratio = cachedTokens / usage.input_tokens;
	}
	const cacheCreation = numberField(rawUsage, "cache_creation_input_tokens");
	const cacheRead = numberField(rawUsage, "cache_read_input_tokens");
	if (cacheCreation !== undefined) {
		result.cache_creation_input_tokens = cacheCreation;
	}
	if (cacheRead !== undefined) {
		result.cache_read_input_tokens = cacheRead;
	}
	return result;
}
