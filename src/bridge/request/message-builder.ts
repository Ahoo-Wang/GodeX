import type { ChatCompletionMessageParam } from "../../protocol/openai/completions";
import type { NormalizedChatMessage } from "./input-normalizer";

export function buildChatMessages(
	normalized: readonly NormalizedChatMessage[],
): ChatCompletionMessageParam[] {
	return normalized.map((message) => ({ ...message }));
}
