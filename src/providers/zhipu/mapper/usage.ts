import type { ChatUsageMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponseUsage } from "../../../protocol/openai/responses";
import type { ChatCompletionResponse } from "../protocol/completions";

export class ZhipuUsageMapper
	implements ChatUsageMapper<ChatCompletionResponse>
{
	map(source: ChatCompletionResponse): ResponseUsage | undefined {
		if (!source.usage) return undefined;
		return {
			input_tokens: source.usage.prompt_tokens,
			output_tokens: source.usage.completion_tokens,
			total_tokens: source.usage.total_tokens,
		};
	}
}
