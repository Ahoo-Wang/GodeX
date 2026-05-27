import { describe, expect, test } from "bun:test";
import { ResponsesContext } from "../../../context/responses-context";
import { basicRequest, createTestApp, FakeMapper } from "./test-fixtures";

describe("responses route test fixtures", () => {
	test("FakeMapper default stream mapper returns no events", async () => {
		const app = createTestApp();
		const ctx = await ResponsesContext.create(app, basicRequest);
		const events = new FakeMapper().stream.map(ctx, {
			event: "message",
			data: {},
		});

		expect(events).toEqual([]);
	});

	test("createTestApp default client supports request and stream calls", async () => {
		const app = createTestApp();
		const provider = app.registrar.resolve("zhipu");

		await expect(provider.client.request({})).resolves.toEqual({});
		const stream = await provider.client.stream({});
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
