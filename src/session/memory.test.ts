import { describe, expect, test } from "bun:test";
import { SessionError } from "../error";
import type { ResponseItem } from "../protocol/openai/responses";
import type { StoredResponseSession } from ".";
import { MemoryResponseSessionStore } from "./memory";

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
	input: ResponseItem = userInput,
): StoredResponseSession {
	return {
		id,
		previous_response_id: previousResponseId,
		conversation_id: null,
		created_at: 1_764_000_000,
		completed_at: 1_764_000_001,
		status: "completed",
		request: {
			input: [input],
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
			provider: "memory-test",
		},
	};
}

describe("MemoryResponseSessionStore", () => {
	test("saves, reads, overwrites, and deletes response sessions", async () => {
		const store = new MemoryResponseSessionStore();
		const first = completedTurn("resp_1", null);

		await store.save(first, { expected_previous_response_id: null });
		await expect(store.get("resp_1")).resolves.toEqual(first);
		await expect(store.get("missing")).resolves.toBeNull();

		first.response.output_text = "mutated after save";
		await expect(store.get("resp_1")).resolves.toMatchObject({
			response: { output_text: "output resp_1" },
		});

		const replacement = {
			...completedTurn("resp_1", null),
			response: {
				...completedTurn("resp_1", null).response,
				output_text: "replacement",
			},
		} satisfies StoredResponseSession;

		await expect(store.save(replacement)).rejects.toMatchObject({
			code: "session.store.conflict",
		});
		await store.save(replacement, { overwrite: true });
		await expect(store.get("resp_1")).resolves.toEqual(replacement);

		await store.delete("resp_1");
		await expect(store.get("resp_1")).resolves.toBeNull();
	});

	test("returns cloned sessions so callers cannot mutate stored state", async () => {
		const store = new MemoryResponseSessionStore();
		const first = completedTurn("resp_clone", null);

		await store.save(first);
		const read = await store.get("resp_clone");
		expect(read).not.toBeNull();
		if (!read) throw new Error("Expected stored response");
		read.response.output_text = "mutated read";

		await expect(store.get("resp_clone")).resolves.toMatchObject({
			response: { output_text: "output resp_clone" },
		});
	});

	test("resolves chains from oldest to newest and flattens input items", async () => {
		const store = new MemoryResponseSessionStore();
		const first = completedTurn("resp_1", null);
		const second = completedTurn("resp_2", "resp_1", secondInput);

		await store.save(first);
		await store.save(second);

		await expect(store.resolveChain("resp_2")).resolves.toEqual({
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

	test("reports missing, unavailable, depth, and cycle errors", async () => {
		const store = new MemoryResponseSessionStore();
		const first = completedTurn("resp_1", null);
		const incomplete = {
			...completedTurn("resp_pending", null),
			status: "in_progress",
		} satisfies StoredResponseSession;
		const cycleA = completedTurn("resp_cycle_a", "resp_cycle_b");
		const cycleB = completedTurn("resp_cycle_b", "resp_cycle_a");

		await store.save(first);
		await store.save(incomplete);
		await store.save(cycleA);
		await store.save(cycleB);

		await expect(store.resolveChain("missing")).rejects.toMatchObject({
			code: "session.chain.not_found",
		});
		await expect(store.resolveChain("resp_pending")).rejects.toMatchObject({
			code: "session.chain.unavailable",
		});
		await expect(
			store.resolveChain("resp_1", { max_depth: 0 }),
		).rejects.toMatchObject({
			code: "session.chain.depth_exceeded",
		});
		await expect(store.resolveChain("resp_cycle_a")).rejects.toMatchObject({
			code: "session.chain.cycle_detected",
		});

		await expect(
			store.resolveChain("resp_pending", { include_incomplete: true }),
		).resolves.toMatchObject({
			previous_response_id: "resp_pending",
		});

		const conflict = store.save(first, {
			overwrite: true,
			expected_previous_response_id: "nope",
		});
		await expect(conflict).rejects.toBeInstanceOf(SessionError);
		await expect(conflict).rejects.toMatchObject({
			code: "session.store.conflict",
		});
	});
});
