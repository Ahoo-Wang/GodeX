import type {
	ChatStreamDeltaMapper,
	ChatStreamToolCallDelta,
} from "../../../adapter/mapper/chat/contract";
import type { ResponseUsage } from "../../../protocol/openai/responses";
import type {
	ChatCompletionChunk,
	ChatCompletionStreamDelta,
	FinishReason,
} from "../protocol/completions";

export class ZhipuStreamDeltaMapper
	implements
		ChatStreamDeltaMapper<
			ChatCompletionChunk,
			ChatCompletionStreamDelta,
			FinishReason
		>
{
	extractChoice(chunk: ChatCompletionChunk): {
		delta: ChatCompletionStreamDelta;
		finishReason?: FinishReason | null;
	} | null {
		const choice = chunk.choices?.[0];
		if (!choice) return null;
		return {
			delta: (choice.delta ?? {}) as ChatCompletionStreamDelta,
			finishReason: choice.finish_reason as FinishReason | null,
		};
	}

	extractText(delta: ChatCompletionStreamDelta): string {
		return delta.content != null ? extractStreamDeltaText(delta.content) : "";
	}

	extractReasoningText(delta: ChatCompletionStreamDelta): string {
		return delta.reasoning_content != null
			? String(delta.reasoning_content)
			: "";
	}

	extractRefusalText(_delta: ChatCompletionStreamDelta): string {
		return "";
	}

	extractToolCalls(
		delta: ChatCompletionStreamDelta,
	): ChatStreamToolCallDelta[] {
		return (delta.tool_calls ?? []) as ChatStreamToolCallDelta[];
	}

	extractUsage(chunk: ChatCompletionChunk): ResponseUsage | undefined {
		if (!chunk.usage) return undefined;
		const result: ResponseUsage = {
			input_tokens: chunk.usage.prompt_tokens,
			output_tokens: chunk.usage.completion_tokens,
			total_tokens: chunk.usage.total_tokens,
		};
		const cached = chunk.usage.prompt_tokens_details?.cached_tokens;
		if (cached !== undefined) {
			result.input_tokens_details = { cached_tokens: cached };
		}
		return result;
	}
}

function extractStreamDeltaText(
	content: NonNullable<ChatCompletionStreamDelta["content"]>,
): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((p) => p.type === "text")
			.map((p) => p.text)
			.join("");
	}
	return "";
}
