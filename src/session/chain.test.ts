import { describe, expect, test } from "bun:test";
import type { ResponseItem } from "../protocol/openai/responses";
import type { StoredResponseSession } from ".";
import { resolveResponseSessionChain } from "./chain";

const userInput: ResponseItem = {
	type: "message",
	role: "user",
	content: [{ type: "input_text", text: "Hello" }],
};

const secondInput: ResponseItem = {
	type: "message",
	role: "user",
	content: [{ type: "input_text", text: "And population?" }],
};

function completedTurn(
	id: string,
	previousResponseId: string | null,
	input: ResponseItem | string = userInput,
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
	};
}

describe("resolveResponseSessionChain", () => {
	test("orders turns oldest to newest and flattens request/response items", async () => {
		const first = completedTurn("resp_1", null);
		const second = completedTurn("resp_2", "resp_1", secondInput);
		const sessions = new Map([
			[first.id, first],
			[second.id, second],
		]);

		await expect(
			resolveResponseSessionChain("resp_2", {
				get: (responseId) => sessions.get(responseId) ?? null,
			}),
		).resolves.toEqual({
			previous_response_id: "resp_2",
			turns: [first, second],
			input_items: [
				userInput,
				...first.response.output,
				secondInput,
				...second.response.output,
			],
		});
	});

	test("preserves string request inputs as user message history", async () => {
		const first = completedTurn("resp_1", null, "Plain text question");
		const sessions = new Map([[first.id, first]]);

		await expect(
			resolveResponseSessionChain("resp_1", {
				get: (responseId) => sessions.get(responseId) ?? null,
			}),
		).resolves.toMatchObject({
			input_items: [
				{
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "Plain text question" }],
				},
				...first.response.output,
			],
		});
	});

	test("reports missing, unavailable, depth, and cycle errors", async () => {
		const first = completedTurn("resp_1", null);
		const incomplete = {
			...completedTurn("resp_pending", null),
			status: "in_progress",
		} satisfies StoredResponseSession;
		const cycleA = completedTurn("resp_cycle_a", "resp_cycle_b");
		const cycleB = completedTurn("resp_cycle_b", "resp_cycle_a");
		const sessions = new Map([
			[first.id, first],
			[incomplete.id, incomplete],
			[cycleA.id, cycleA],
			[cycleB.id, cycleB],
		]);
		const get = (responseId: string) => sessions.get(responseId) ?? null;

		await expect(
			resolveResponseSessionChain("missing", { get }),
		).rejects.toMatchObject({
			code: "session.chain.not_found",
		});
		await expect(
			resolveResponseSessionChain("resp_pending", { get }),
		).rejects.toMatchObject({
			code: "session.chain.unavailable",
		});
		await expect(
			resolveResponseSessionChain("resp_1", { get, max_depth: 0 }),
		).rejects.toMatchObject({
			code: "session.chain.depth_exceeded",
		});
		await expect(
			resolveResponseSessionChain("resp_cycle_a", { get }),
		).rejects.toMatchObject({
			code: "session.chain.cycle_detected",
		});

		await expect(
			resolveResponseSessionChain("resp_pending", {
				get,
				include_incomplete: true,
			}),
		).resolves.toMatchObject({
			previous_response_id: "resp_pending",
		});
	});
});
