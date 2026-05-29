import type { ProviderStreamDelta } from "../../bridge/stream";

export interface ChatStreamToolCallDeltaLike {
	readonly index?: number;
	readonly id?: string;
	readonly type?: string;
	readonly function?: {
		readonly name?: string;
		readonly arguments?: string;
	};
}

export interface ChatStreamDeltaLike {
	readonly reasoning_content?: string | null;
	readonly tool_calls?: readonly ChatStreamToolCallDeltaLike[];
}

export function mapCommonChatStreamDelta(
	delta: ChatStreamDeltaLike,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	if (delta.reasoning_content) {
		deltas.push({ reasoning: delta.reasoning_content });
	}
	for (const toolCall of delta.tool_calls ?? []) {
		const providerToolCall = {
			...(toolCall.index !== undefined ? { index: toolCall.index } : {}),
			...(toolCall.id !== undefined ? { id: toolCall.id } : {}),
			...(toolCall.type !== undefined ? { type: toolCall.type } : {}),
			...(toolCall.function?.name !== undefined
				? { name: toolCall.function.name }
				: {}),
			...(toolCall.function?.arguments !== undefined
				? { arguments: toolCall.function.arguments }
				: {}),
		};
		if (Object.keys(providerToolCall).length > 0) {
			deltas.push({ toolCall: providerToolCall });
		}
	}
	return deltas;
}
