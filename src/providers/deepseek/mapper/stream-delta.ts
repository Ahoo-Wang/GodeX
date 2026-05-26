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

export class DeepSeekStreamDeltaMapper
	implements
		ChatStreamDeltaMapper<
			ChatCompletionChunk,
			ChatCompletionStreamDelta,
			FinishReason
		>
{
	extractChoice(_chunk: ChatCompletionChunk): null {
		return null;
	}

	extractText(_delta: ChatCompletionStreamDelta): string {
		return "";
	}

	extractReasoningText(_delta: ChatCompletionStreamDelta): string {
		return "";
	}

	extractRefusalText(_delta: ChatCompletionStreamDelta): string {
		return "";
	}

	extractToolCalls(
		_delta: ChatCompletionStreamDelta,
	): ChatStreamToolCallDelta[] {
		return [];
	}

	extractUsage(_chunk: ChatCompletionChunk): ResponseUsage | undefined {
		return undefined;
	}
}
