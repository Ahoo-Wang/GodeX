// src/adapter/mapper/message-utils.ts
// Helpers for converting Responses API instructions and input items into chat messages.

import type { ResponseItem } from "../../protocol/openai/responses";

export function instructionsToSystemMessage(
	instructions: string | undefined,
): { role: "system"; content: string } | null {
	if (!instructions) return null;
	return { role: "system", content: instructions };
}

export function inputItemsToMessages(items: ResponseItem[]): unknown[] {
	const messages: unknown[] = [];
	for (const item of items) {
		if ("role" in item && "content" in item) {
			messages.push(item);
		}
	}
	return messages;
}
