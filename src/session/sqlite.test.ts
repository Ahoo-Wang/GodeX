import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLiteResponseSessionStore } from "./sqlite";
import { completedTurn } from "./test-fixtures";

describe("SQLiteResponseSessionStore", () => {
	test("creates response session tables and indexes", () => {
		const store = new SQLiteResponseSessionStore(":memory:");
		try {
			const tables = store.db
				.query(
					"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
				)
				.all();
			const indexes = store.db
				.query(
					"SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name",
				)
				.all();

			expect(tables).toContainEqual({ name: "response_sessions" });
			expect(indexes).toContainEqual({
				name: "idx_response_sessions_conversation_id",
			});
			expect(indexes).toContainEqual({
				name: "idx_response_sessions_previous_response_id",
			});
		} finally {
			store.close();
		}
	});

	test("persists sessions across file-backed store instances", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-session-"));
		const dbPath = join(dir, "sessions.sqlite");
		const first = completedTurn("resp_file", null, undefined, "sqlite-test");
		let writer: SQLiteResponseSessionStore | undefined;
		let reader: SQLiteResponseSessionStore | undefined;

		try {
			writer = new SQLiteResponseSessionStore(dbPath);
			await writer.save(first);
			writer.close();
			writer = undefined;

			reader = new SQLiteResponseSessionStore(dbPath);
			await expect(reader.get("resp_file")).resolves.toEqual(first);
		} finally {
			reader?.close();
			writer?.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("preserves sessions without metadata", async () => {
		const store = new SQLiteResponseSessionStore(":memory:");
		try {
			const withoutMetadata = completedTurn("resp_no_metadata", null);
			delete withoutMetadata.metadata;

			await store.save(withoutMetadata);
			await expect(store.get("resp_no_metadata")).resolves.toEqual(
				withoutMetadata,
			);
		} finally {
			store.close();
		}
	});

	test("does not close externally owned database instances", () => {
		const db = new Database(":memory:");
		const store = new SQLiteResponseSessionStore(db);

		store.close();

		expect(
			db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all(),
		).toContainEqual({ name: "response_sessions" });
		db.close();
	});
});
