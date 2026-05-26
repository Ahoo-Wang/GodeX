import type { ChatUsageMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponseUsage } from "../../../protocol/openai/responses";
import type { ChatCompletion, CompletionUsage } from "../protocol/completions";

export function mapDeepSeekUsage(
	usage: CompletionUsage | null | undefined,
): ResponseUsage | undefined {
	if (!usage) return undefined;
	const result: ResponseUsage = {
		input_tokens: usage.prompt_tokens,
		output_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens,
	};
	if (usage.prompt_cache_hit_tokens !== undefined) {
		result.input_tokens_details = {
			cached_tokens: usage.prompt_cache_hit_tokens,
		};
	}
	const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
	if (reasoningTokens !== undefined) {
		result.output_tokens_details = { reasoning_tokens: reasoningTokens };
	}
	return result;
}

export class DeepSeekUsageMapper implements ChatUsageMapper<ChatCompletion> {
	map(source: ChatCompletion): ResponseUsage | undefined {
		return mapDeepSeekUsage(source.usage);
	}
}
