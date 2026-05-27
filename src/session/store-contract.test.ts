import { describe, expect, test } from "bun:test";
import { SessionError } from "../error";
import { MemoryResponseSessionStore } from "./memory";
import { SQLiteResponseSessionStore } from "./sqlite";
import {
	completedTurn,
	cycleTurns,
	incompleteTurn,
	secondInput,
	userInput,
} from "./test-fixtures";
import type { ResponseSessionStore, StoredResponseSession } from "./types";

interface StoreCase {
	name: string;
	create(): ResponseSessionStore;
	close?(store: ResponseSessionStore): void;
}

const storeCases: StoreCase[] = [
	{
		name: "memory",
		create: () => new MemoryResponseSessionStore(),
	},
	{
		name: "sqlite",
		create: () => new SQLiteResponseSessionStore(":memory:"),
		close: (store) => store.close?.(),
	},
];

function firstTextContent(items: Array<{ content: Array<{ text: string }> }>): {
	text: string;
} {
	const item = items.at(0);
	if (!item) throw new Error("Expected test session item");
	const content = item.content.at(0);
	if (!content) throw new Error("Expected test session content");
	return content;
}

function mutateNestedSessionState(session: StoredResponseSession): void {
	const requestInput = session.request.input as Array<{
		content: Array<{ text: string }>;
	}>;
	firstTextContent(requestInput).text = "mutated request input";

	const responseOutput = session.response.output as Array<{
		content: Array<{ text: string }>;
	}>;
	firstTextContent(responseOutput).text = "mutated response output";

	const metadata = session.metadata as { nested: { marker: string } };
	metadata.nested.marker = "mutated metadata";
}

for (const storeCase of storeCases) {
	describe(`${storeCase.name} ResponseSessionStore behavior`, () => {
		test("saves, reads, overwrites, and deletes response sessions", async () => {
			const store = storeCase.create();
			try {
				const first = completedTurn("resp_1", null, undefined, storeCase.name);

				await store.save(first, { expected_previous_response_id: null });
				await expect(store.get("resp_1")).resolves.toEqual(first);
				await expect(store.get("missing")).resolves.toBeNull();

				const replacement = {
					...completedTurn("resp_1", null, undefined, storeCase.name),
					response: {
						...first.response,
						output_text: "replacement",
					},
				};

				await expect(store.save(replacement)).rejects.toMatchObject({
					code: "session.store.conflict",
				});
				await store.save(replacement, { overwrite: true });
				await expect(store.get("resp_1")).resolves.toEqual(replacement);

				await store.delete("resp_1");
				await expect(store.get("resp_1")).resolves.toBeNull();
			} finally {
				storeCase.close?.(store);
			}
		});

		test("isolates stored sessions from caller mutations", async () => {
			const store = storeCase.create();
			try {
				const first = {
					...completedTurn(
						"resp_isolation",
						null,
						{
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: "original request" }],
						},
						storeCase.name,
					),
					metadata: {
						provider: storeCase.name,
						nested: { marker: "original metadata" },
					},
				} satisfies StoredResponseSession;
				const expected = structuredClone(first);

				await store.save(first);
				mutateNestedSessionState(first);

				await expect(store.get("resp_isolation")).resolves.toEqual(expected);

				const read = await store.get("resp_isolation");
				expect(read).not.toBeNull();
				if (!read) throw new Error("Expected stored response");
				mutateNestedSessionState(read);

				await expect(store.get("resp_isolation")).resolves.toEqual(expected);
			} finally {
				storeCase.close?.(store);
			}
		});

		test("resolves chains from oldest to newest and flattens input items", async () => {
			const store = storeCase.create();
			try {
				const first = completedTurn("resp_1", null, undefined, storeCase.name);
				const second = completedTurn(
					"resp_2",
					"resp_1",
					secondInput,
					storeCase.name,
				);

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
			} finally {
				storeCase.close?.(store);
			}
		});

		test("reports missing, unavailable, depth, cycle, and save conflicts", async () => {
			const store = storeCase.create();
			try {
				const first = completedTurn("resp_1", null, undefined, storeCase.name);
				const incomplete = incompleteTurn("resp_pending");
				const [cycleA, cycleB] = cycleTurns();

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
			} finally {
				storeCase.close?.(store);
			}
		});
	});
}
