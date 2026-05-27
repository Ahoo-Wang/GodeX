import { describe, expect, test } from "bun:test";
import { resolveResponseSessionChain } from "./chain";
import {
	completedTurn,
	cycleTurns,
	incompleteTurn,
	secondInput,
	userInput,
} from "./test-fixtures";

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
		const incomplete = incompleteTurn("resp_pending");
		const [cycleA, cycleB] = cycleTurns();
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
