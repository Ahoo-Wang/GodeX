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

	extractUsage(_chunk: ChatCompletionChunk): ResponseUsage | undefined {
		return undefined;
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
