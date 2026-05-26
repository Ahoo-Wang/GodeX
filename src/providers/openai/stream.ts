import type {
	StreamResponseTerminalStatus,
	ToolCallSnapshot,
} from "../../adapter/mapper/stream-response-state";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ChatCompletionChunk,
	ChatCompletionStreamDelta,
} from "../../protocol/openai/completions";
import type {
	ResponseItem,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { FinishReason } from "../../protocol/openai/shared";
import {
	ChatCompletionStreamMapper,
	type ChatStreamChoice,
	type ChatStreamToolCallDelta,
} from "../shared/chat-stream-mapper";
import { mapUsage, openAIStatusFields } from "./response-common";
import { mapToolCall } from "./tool-calls";

export class OpenAIStreamMapper extends ChatCompletionStreamMapper<
	ChatCompletionChunk,
	ChatCompletionStreamDelta,
	FinishReason
> {
	protected override deferTerminal = true;

	protected override extractUsage(
		chunk: ChatCompletionChunk,
	): ResponseUsage | undefined {
		return mapUsage(chunk.usage ?? undefined);
	}

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
			.filter((toolCall) => {
				const raw = toolCall as unknown as Record<string, unknown>;
				return raw.type === "function" || raw.function;
			})
			.map((toolCall) => {
				const raw = toolCall as unknown as Record<string, unknown>;
				return {
					index: typeof raw.index === "number" ? raw.index : undefined,
					id: typeof raw.id === "string" ? raw.id : undefined,
					type: typeof raw.type === "string" ? raw.type : "function",
					function: (typeof raw.function === "object" && raw.function
						? raw.function
						: undefined) as { name?: string; arguments?: string } | undefined,
				};
			});
	}

	protected mapFinishReason(
		finishReason: FinishReason,
	): StreamResponseTerminalStatus {
		return openAIStatusFields(finishReason) as StreamResponseTerminalStatus;
	}

	protected mapToolCall(
		ctx: ResponsesContext,
		toolCall: ToolCallSnapshot,
	): ResponseItem {
		return mapToolCall(ctx, toolCall);
	}
}
