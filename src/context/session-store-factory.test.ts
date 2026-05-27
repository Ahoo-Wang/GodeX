import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryResponseSessionStore } from "../session/memory";
import { SQLiteResponseSessionStore } from "../session/sqlite";
import { createResponseSessionStore } from "./session-store-factory";

const originalCwd = process.cwd();
let tempDir: string | undefined;

afterEach(() => {
	process.chdir(originalCwd);
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	}
});

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
		tempDir = mkdtempSync(join(tmpdir(), "godex-session-store-factory-"));
		process.chdir(tempDir);

		const store = createResponseSessionStore({
			backend: "sqlite",
		});

		expect(store).toBeInstanceOf(SQLiteResponseSessionStore);
		expect(existsSync(join(tempDir, "data", "sessions.db"))).toBe(true);
		store.close?.();
	});
});
