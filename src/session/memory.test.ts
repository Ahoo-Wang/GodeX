import { describe, expect, test } from "bun:test";
import { MemoryResponseSessionStore } from "./memory";
import { completedTurn } from "./test-fixtures";

describe("MemoryResponseSessionStore", () => {
	test("clones constructor sessions so callers cannot mutate initial state", async () => {
		const first = completedTurn("resp_constructor", null);
		const store = new MemoryResponseSessionStore([first]);

		first.response.output_text = "mutated after constructor";

		await expect(store.get("resp_constructor")).resolves.toMatchObject({
			response: { output_text: "output resp_constructor" },
		});
	});

	test("returns cloned sessions so callers cannot mutate stored state", async () => {
		const store = new MemoryResponseSessionStore();
		const first = completedTurn("resp_clone", null);

		await store.save(first);
		first.response.output_text = "mutated after save";
		await expect(store.get("resp_clone")).resolves.toMatchObject({
			response: { output_text: "output resp_clone" },
		});

		const read = await store.get("resp_clone");
		expect(read).not.toBeNull();
		if (!read) throw new Error("Expected stored response");
		read.response.output_text = "mutated read";

		await expect(store.get("resp_clone")).resolves.toMatchObject({
			response: { output_text: "output resp_clone" },
		});
	});

	test("clears stored sessions", async () => {
		const store = new MemoryResponseSessionStore([
			completedTurn("resp_clear", null),
		]);

		await expect(store.get("resp_clear")).resolves.not.toBeNull();
		store.clear();
		await expect(store.get("resp_clear")).resolves.toBeNull();
	});
});
