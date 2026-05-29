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
		if (
			isAssistantTurnPrefixMessage(previous) &&
			isAssistantTurnPrefixMessage(next)
		) {
			messages[messages.length - 1] = mergeAssistantTextMessages(
				previous,
				next,
			);
			continue;
		}
		if (
			isAssistantTurnPrefixMessage(previous) &&
			isAssistantToolCallMessage(next)
		) {
			messages[messages.length - 1] = mergeAssistantTurnPrefix(previous, next);
			continue;
		}
		if (
			isAssistantToolCallMessage(previous) &&
			isAssistantTurnPrefixMessage(next)
		) {
			messages[messages.length - 1] = mergeAssistantToolCallSuffix(
				previous,
				next,
			);
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

function mergeAssistantTextMessages(
	left: ChatCompletionAssistantMessageParam,
	right: ChatCompletionAssistantMessageParam,
): ChatCompletionAssistantMessageParam {
	const reasoningContent = mergeReasoningContent(
		left.reasoning_content,
		right.reasoning_content,
	);
	return {
		...left,
		content: mergeAssistantContent(left.content, right.content),
		...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
	};
}

function mergeAssistantTurnPrefix(
	prefix: ChatCompletionAssistantMessageParam,
	toolCallMessage: ChatCompletionAssistantMessageParam & {
		tool_calls: NonNullable<ChatCompletionAssistantMessageParam["tool_calls"]>;
	},
): ChatCompletionAssistantMessageParam {
	const reasoningContent = mergeReasoningContent(
		prefix.reasoning_content,
		toolCallMessage.reasoning_content,
	);
	return {
		...prefix,
		content: mergeAssistantContent(prefix.content, toolCallMessage.content),
		...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
		tool_calls: [...toolCallMessage.tool_calls],
	};
}

function mergeAssistantToolCallSuffix(
	toolCallMessage: ChatCompletionAssistantMessageParam & {
		tool_calls: NonNullable<ChatCompletionAssistantMessageParam["tool_calls"]>;
	},
	suffix: ChatCompletionAssistantMessageParam,
): ChatCompletionAssistantMessageParam {
	const reasoningContent = mergeReasoningContent(
		toolCallMessage.reasoning_content,
		suffix.reasoning_content,
	);
	return {
		...toolCallMessage,
		content: mergeAssistantContent(toolCallMessage.content, suffix.content),
		...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
		tool_calls: [...toolCallMessage.tool_calls],
	};
}

function isAssistantTurnPrefixMessage(
	message: ChatCompletionMessageParam | undefined,
): message is ChatCompletionAssistantMessageParam {
	return (
		message?.role === "assistant" &&
		!message.audio &&
		!message.function_call &&
		!message.refusal &&
		(!Array.isArray(message.tool_calls) || message.tool_calls.length === 0)
	);
}

function isAssistantToolCallMessage(
	message: ChatCompletionMessageParam | undefined,
): message is ChatCompletionAssistantMessageParam & {
	tool_calls: NonNullable<ChatCompletionAssistantMessageParam["tool_calls"]>;
} {
	return (
		message?.role === "assistant" &&
		Array.isArray(message.tool_calls) &&
		message.tool_calls.length > 0
	);
}

function mergeAssistantContent(
	left: ChatCompletionAssistantMessageParam["content"],
	right: ChatCompletionAssistantMessageParam["content"],
): ChatCompletionAssistantMessageParam["content"] {
	if (!left || (Array.isArray(left) && left.length === 0)) return right;
	if (!right || (Array.isArray(right) && right.length === 0)) return left;
	if (typeof left === "string" && typeof right === "string") {
		return `${left}\n${right}`;
	}
	if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
	return left;
}

function mergeReasoningContent(
	left: string | null | undefined,
	right: string | null | undefined,
): string | null | undefined {
	if (!left) return right;
	if (!right) return left;
	return `${left}\n${right}`;
}
