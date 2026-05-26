import type {
	Reasoning,
	ResponseOutputMessage,
} from "../../protocol/openai/responses";

export type MessageBlockKind = "text" | "refusal";

export interface MessageBlock {
	kind: MessageBlockKind;
	outputIndex: number;
	contentIndex: number;
	itemId: string;
	text: string;
	done: boolean;
}

export interface ReasoningBlock {
	outputIndex: number;
	contentIndex: number;
	itemId: string;
	text: string;
	done: boolean;
}

export function messageItem(block: MessageBlock): ResponseOutputMessage {
	const content =
		block.kind === "text"
			? [{ type: "output_text" as const, text: block.text }]
			: [{ type: "refusal" as const, refusal: block.text }];
	return {
		id: block.itemId,
		type: "message",
		role: "assistant",
		status: block.done ? "completed" : "in_progress",
		content: block.done ? content : [],
	};
}

export function reasoningItem(block: ReasoningBlock): Reasoning {
	return {
		id: block.itemId,
		type: "reasoning",
		status: block.done ? "completed" : "in_progress",
		summary: [],
		content: block.done ? [{ type: "reasoning_text", text: block.text }] : [],
	};
}

export function contentPart(block: MessageBlock) {
	return block.kind === "text"
		? { type: "output_text" as const, text: block.done ? block.text : "" }
		: { type: "refusal" as const, refusal: block.done ? block.text : "" };
}
