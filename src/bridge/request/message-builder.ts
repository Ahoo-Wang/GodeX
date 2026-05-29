import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionMessageParam,
} from "../../protocol/openai/completions";
import type { NormalizedChatMessage } from "./input-normalizer";

export function buildChatMessages(
	normalized: readonly NormalizedChatMessage[],
): ChatCompletionMessageParam[] {
	const messages: ChatCompletionMessageParam[] = [];
	for (const message of normalized) {
		const next = cloneMessage(message);
		const previous = messages.at(-1);
		if (
			isAssistantToolCallMessage(previous) &&
			isAssistantToolCallMessage(next)
		) {
			previous.tool_calls = [...previous.tool_calls, ...next.tool_calls];
			const reasoningContent = mergeReasoningContent(
				previous.reasoning_content,
				next.reasoning_content,
			);
			if (reasoningContent) previous.reasoning_content = reasoningContent;
			continue;
		}
		messages.push(next);
	}
	return messages;
}

function cloneMessage(
	message: NormalizedChatMessage,
): ChatCompletionMessageParam {
	if (isAssistantToolCallMessage(message)) {
		return { ...message, tool_calls: [...message.tool_calls] };
	}
	return { ...message };
}

function isAssistantToolCallMessage(
	message: ChatCompletionMessageParam | undefined,
): message is ChatCompletionAssistantMessageParam & {
	tool_calls: NonNullable<ChatCompletionAssistantMessageParam["tool_calls"]>;
} {
	return (
		message?.role === "assistant" &&
		Array.isArray(message.tool_calls) &&
		message.tool_calls.length > 0 &&
		(message.content === undefined ||
			message.content === "" ||
			(Array.isArray(message.content) && message.content.length === 0))
	);
}

function mergeReasoningContent(
	left: string | null | undefined,
	right: string | null | undefined,
): string | null | undefined {
	if (!left) return right;
	if (!right) return left;
	return `${left}\n${right}`;
}
