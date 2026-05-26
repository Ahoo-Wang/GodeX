import type { ChatUsageMapper } from "../../../adapter/mapper/chat/contract";
import type {
	ChatCompletion,
	ChatCompletionChunk,
} from "../../../protocol/openai/completions";
import type { ResponseUsage } from "../../../protocol/openai/responses";

export function mapUsage(
	usage:
		| {
				prompt_tokens: number;
				completion_tokens: number;
				total_tokens: number;
				completion_tokens_details?: { reasoning_tokens?: number };
				prompt_tokens_details?: { cached_tokens?: number };
		  }
		| undefined,
): ResponseUsage | undefined {
	if (!usage) return undefined;
	return {
		input_tokens: usage.prompt_tokens,
		output_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens,
		...(usage.prompt_tokens_details?.cached_tokens !== undefined
			? {
					input_tokens_details: {
						cached_tokens: usage.prompt_tokens_details.cached_tokens,
					},
				}
			: {}),
		...(usage.completion_tokens_details?.reasoning_tokens !== undefined
			? {
					output_tokens_details: {
						reasoning_tokens: usage.completion_tokens_details.reasoning_tokens,
					},
				}
			: {}),
	};
}

export class OpenAIUsageMapper
	implements ChatUsageMapper<ChatCompletion | ChatCompletionChunk>
{
	map(source: ChatCompletion | ChatCompletionChunk): ResponseUsage | undefined {
		return mapUsage(source.usage ?? undefined);
	}
}
