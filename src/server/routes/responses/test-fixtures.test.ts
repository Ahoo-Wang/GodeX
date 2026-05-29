import { describe, expect, test } from "bun:test";
import { createTestApp } from "./test-fixtures";

describe("responses route test fixtures", () => {
	test("createTestApp default provider maps empty stream chunks to empty deltas", async () => {
		const app = createTestApp();
		const provider = app.registrar.resolve("zhipu");
		const deltas = provider.spec.stream.deltas("ignored");

		expect(deltas).toEqual([]);
	});

	test("createTestApp default provider supports request and stream calls", async () => {
		const app = createTestApp();
		const provider = app.registrar.resolve("zhipu");

		await expect(provider.request({})).resolves.toMatchObject({
			choices: [{ finish_reason: "stop" }],
		});
		const stream = await provider.stream({});
		expect(stream).toBeInstanceOf(ReadableStream);

		const reader = stream.getReader();
		try {
			const result = await reader.read();
			expect(result.done).toBe(true);
		} finally {
			reader.releaseLock();
		}
	});
});
