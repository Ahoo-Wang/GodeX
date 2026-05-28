import type { ChatStreamDeltaMapper } from "../../../adapter/mapper/chat/contract";
import type { ChatCompletionChunk } from "../../../protocol/openai/completions";
import type { ResponseUsage } from "../../../protocol/openai/responses";
import type { FinishReason } from "../../../protocol/openai/shared";
import { mapUsage } from "./usage";

export interface ChatCompletionStreamDelta {
	role?: string;
	content?: string | null;
	refusal?: string | null;
	tool_calls?: unknown[];
}

export class OpenAIStreamDeltaMapper
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
			finishReason: choice.finish_reason,
		};
	}

	extractText(delta: ChatCompletionStreamDelta): string {
		return delta.content != null ? String(delta.content) : "";
	}

	extractReasoningText(delta: ChatCompletionStreamDelta): string {
		const reasoningContent = (delta as Record<string, unknown>)
			.reasoning_content;
		return reasoningContent != null ? String(reasoningContent) : "";
	}

	extractRefusalText(delta: ChatCompletionStreamDelta): string {
		return delta.refusal != null ? String(delta.refusal) : "";
	}

	extractToolCalls(delta: ChatCompletionStreamDelta): {
		index?: number;
		id?: string;
		type?: string;
		function?: { name?: string; arguments?: string };
		custom?: { name?: string; input?: string };
	}[] {
		return ((delta.tool_calls ?? []) as unknown[])
			.filter((toolCall) => {
				const raw = toolCall as Record<string, unknown>;
				return (
					raw.type === "function" ||
					raw.function ||
					raw.type === "custom" ||
					raw.custom
				);
			})
			.map((toolCall) => {
				const raw = toolCall as Record<string, unknown>;
				const custom =
					typeof raw.custom === "object" && raw.custom
						? (raw.custom as { name?: string; input?: string })
						: undefined;
				return {
					index: typeof raw.index === "number" ? raw.index : undefined,
					id: typeof raw.id === "string" ? raw.id : undefined,
					type: typeof raw.type === "string" ? raw.type : "function",
					function: (typeof raw.function === "object" && raw.function
						? raw.function
						: undefined) as { name?: string; arguments?: string } | undefined,
					custom,
				};
			});
	}

	extractUsage(chunk: ChatCompletionChunk): ResponseUsage | undefined {
		return mapUsage(chunk.usage ?? undefined);
	}
}
