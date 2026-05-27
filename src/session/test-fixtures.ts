import type { ResponseItem } from "../protocol/openai/responses";
import type { StoredResponseSession } from "./types";

export const userInput: ResponseItem = {
	type: "message",
	role: "user",
	content: [{ type: "input_text", text: "Hello" }],
};

export const secondInput: ResponseItem = {
	type: "message",
	role: "user",
	content: [{ type: "input_text", text: "And population?" }],
};

export function completedTurn(
	id: string,
	previousResponseId: string | null,
	input: ResponseItem | string = userInput,
	metadataProvider = "session-test",
): StoredResponseSession {
	return {
		id,
		previous_response_id: previousResponseId,
		conversation_id: null,
		created_at: 1_764_000_000,
		completed_at: 1_764_000_001,
		status: "completed",
		request: {
			input: typeof input === "string" ? input : [input],
			instructions: "You are helpful.",
			model: "gpt-5.4",
			parallel_tool_calls: true,
			truncation: "disabled",
		},
		response: {
			id,
			output: [
				{
					id: `msg_${id}`,
					type: "message",
					role: "assistant",
					status: "completed",
					content: [{ type: "output_text", text: `output ${id}` }],
				},
			],
			output_text: `output ${id}`,
			usage: {
				input_tokens: 3,
				output_tokens: 2,
				total_tokens: 5,
			},
		},
		metadata: {
			provider: metadataProvider,
		},
	};
}

export function incompleteTurn(
	id: string,
	previousResponseId: string | null = null,
): StoredResponseSession {
	return {
		...completedTurn(id, previousResponseId),
		status: "in_progress",
	};
}

export function cycleTurns(): [StoredResponseSession, StoredResponseSession] {
	return [
		completedTurn("resp_cycle_a", "resp_cycle_b"),
		completedTurn("resp_cycle_b", "resp_cycle_a"),
	];
}
