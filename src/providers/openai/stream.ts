import type {
	StreamState,
	ToolCallAccumulator,
} from "../../adapter/mapper/stream-state";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ChatCompletionChunk,
	ChatCompletionStreamDelta,
} from "../../protocol/openai/completions";
import type {
	ResponseItem,
	ResponseObject,
} from "../../protocol/openai/responses";
import type { FinishReason } from "../../protocol/openai/shared";
import {
	ChatCompletionStreamMapper,
	type ChatStreamChoice,
	type ChatStreamToolCallDelta,
} from "../shared/chat-stream-mapper";
import {
	buildOpenAIResponseObject,
	openAIStatusFields,
} from "./response-common";
import { mapToolCall } from "./tool-calls";

export class OpenAIStreamMapper extends ChatCompletionStreamMapper<
	ChatCompletionChunk,
	ChatCompletionStreamDelta,
	FinishReason
> {
	protected extractChoice(
		chunk: ChatCompletionChunk,
	): ChatStreamChoice<ChatCompletionStreamDelta, FinishReason> | null {
		const choice = chunk.choices?.[0];
		if (!choice) return null;
		return {
			delta: choice.delta ?? {},
			finishReason: choice.finish_reason,
		};
	}

	protected extractText(delta: ChatCompletionStreamDelta): string {
		return delta.content != null ? String(delta.content) : "";
	}

	protected override extractReasoningText(
		delta: ChatCompletionStreamDelta,
	): string {
		const reasoningContent = (delta as Record<string, unknown>)
			.reasoning_content;
		return reasoningContent != null ? String(reasoningContent) : "";
	}

	protected override extractRefusalText(
		delta: ChatCompletionStreamDelta,
	): string {
		return delta.refusal != null ? String(delta.refusal) : "";
	}

	protected override extractToolCalls(
		delta: ChatCompletionStreamDelta,
	): ChatStreamToolCallDelta[] {
		return (delta.tool_calls ?? [])
			.filter((toolCall) => toolCall.type === "function")
			.map((toolCall) => {
				const rawIndex = (toolCall as unknown as Record<string, unknown>).index;
				return {
					index: typeof rawIndex === "number" ? rawIndex : undefined,
					id: toolCall.id,
					type: toolCall.type,
					function: toolCall.function,
				};
			});
	}

	protected mapFinishReason(finishReason: FinishReason) {
		return openAIStatusFields(finishReason);
	}

	protected mapToolCall(
		ctx: ResponsesContext,
		toolCall: ToolCallAccumulator,
	): ResponseItem {
		return mapToolCall(ctx, toolCall);
	}

	buildResponseObject(
		ctx: ResponsesContext,
		state: StreamState,
	): ResponseObject {
		return buildOpenAIResponseObject(ctx, state.finalStatus, {
			completedAt: state.completedAt ?? Math.floor(Date.now() / 1000),
			outputText: state.outputText,
			output: this.buildOutputItems(ctx, state),
		});
	}
}
