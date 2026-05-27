import { describe, expect, test } from "bun:test";
import type { SessionConfig } from "../config";
import { MemoryResponseSessionStore } from "../session/memory";
import { SQLiteResponseSessionStore } from "../session/sqlite";
import { createResponseSessionStore } from "./session-store-factory";

describe("createResponseSessionStore", () => {
	test("creates a memory store for memory config", () => {
		const store = createResponseSessionStore({ backend: "memory" });

		expect(store).toBeInstanceOf(MemoryResponseSessionStore);
	});

	test("creates a SQLite store for configured sqlite path", () => {
		const store = createResponseSessionStore({
			backend: "sqlite",
			sqlite: { path: ":memory:" },
		});

		expect(store).toBeInstanceOf(SQLiteResponseSessionStore);
		store.close?.();
	});

	test("creates a SQLite store when sqlite path is omitted", () => {
		const store = createResponseSessionStore({
			backend: "sqlite",
		} as SessionConfig);

		expect(store).toBeInstanceOf(SQLiteResponseSessionStore);
		store.close?.();
	});
});
