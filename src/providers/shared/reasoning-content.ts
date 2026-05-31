export function extractChoiceReasoningContent(
	choice: unknown,
): string | undefined {
	if (typeof choice !== "object" || choice === null || !("message" in choice)) {
		return undefined;
	}
	const message = choice.message;
	if (
		typeof message !== "object" ||
		message === null ||
		!("reasoning_content" in message)
	) {
		return undefined;
	}
	const reasoningContent = message.reasoning_content;
	return typeof reasoningContent === "string" && reasoningContent.length > 0
		? reasoningContent
		: undefined;
}
