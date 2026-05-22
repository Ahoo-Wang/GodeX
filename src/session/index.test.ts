import { describe, expect, test } from "bun:test";
import { SessionError } from "../error";
import * as openaiProtocol from "../protocol/openai";
import type {
	ResponseSessionSnapshot,
	ResponseSessionStore,
	StoredResponseSession,
} from ".";

const completedTurn = {
	id: "resp_1",
	previous_response_id: null,
	conversation_id: null,
	created_at: 1_764_000_000,
	completed_at: 1_764_000_001,
	status: "completed",
	request: {
		input: "Hello",
		instructions: "You are helpful.",
		model: "gpt-5.4",
		parallel_tool_calls: true,
		truncation: "disabled",
	},
	response: {
		id: "resp_1",
		output: [
			{
				id: "msg_1",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "Hi." }],
			},
		],
		output_text: "Hi.",
		usage: {
			input_tokens: 3,
			output_tokens: 2,
			total_tokens: 5,
		},
	},
	metadata: {
		provider: "openai-compatible",
	},
} satisfies StoredResponseSession;

const snapshot = {
	previous_response_id: "resp_1",
	turns: [completedTurn],
	input_items: completedTurn.response.output,
} satisfies ResponseSessionSnapshot;

class ContractOnlyStore implements ResponseSessionStore {
	async get(responseId: string): Promise<StoredResponseSession | null> {
		return responseId === completedTurn.id ? completedTurn : null;
	}

	async save(
		session: StoredResponseSession,
		options?: {
			overwrite?: boolean;
			expected_previous_response_id?: string | null;
		},
	): Promise<void> {
		expect(session.id).toBe(completedTurn.id);
		expect(options?.expected_previous_response_id).toBeNull();
	}

	async resolveChain(
		previousResponseId: string,
		options?: { max_depth?: number; include_incomplete?: boolean },
	): Promise<ResponseSessionSnapshot> {
		expect(previousResponseId).toBe("resp_1");
		expect(options?.max_depth).toBe(16);
		return snapshot;
	}

	async delete(responseId: string): Promise<void> {
		expect(responseId).toBe("resp_1");
	}
}

describe("ResponseSessionStore contract", () => {
	test("can model a stored completed response session", () => {
		expect(completedTurn.id).toBe("resp_1");
		expect(completedTurn.response.output_text).toBe("Hi.");
	});

	test("can implement the async store interface", async () => {
		const store = new ContractOnlyStore();

		await expect(store.get("missing")).resolves.toBeNull();
		await expect(
			store.save(completedTurn, { expected_previous_response_id: null }),
		).resolves.toBeUndefined();
		await expect(
			store.resolveChain("resp_1", { max_depth: 16 }),
		).resolves.toEqual(snapshot);
		await expect(store.delete("resp_1")).resolves.toBeUndefined();
	});

	test("exposes stable error codes", () => {
		const error = new SessionError(
			"session.chain.not_found",
			"Previous response was not found.",
			{ responseId: "resp_missing" },
		);

		expect(error.name).toBe("SessionError");
		expect(error.code).toBe("session.chain.not_found");
		expect(error.context).toEqual({ responseId: "resp_missing" });
	});
});

test("does not leak session runtime helpers through the OpenAI protocol barrel", () => {
	expect("SessionError" in openaiProtocol).toBe(false);
});
