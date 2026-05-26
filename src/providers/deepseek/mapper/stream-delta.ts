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
import { mapDeepSeekUsage } from "./usage";

export class DeepSeekStreamDeltaMapper
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
			delta: choice.delta ?? {},
			finishReason: choice.finish_reason,
		};
	}

	extractText(delta: ChatCompletionStreamDelta): string {
		return delta.content != null ? String(delta.content) : "";
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
		return delta.tool_calls ?? [];
	}

	extractUsage(chunk: ChatCompletionChunk): ResponseUsage | undefined {
		return mapDeepSeekUsage(chunk.usage ?? undefined);
	}
}
