import { describe, expect, test } from "bun:test";
import { sessionToSQLiteParams, sqliteRowToSession } from "./sqlite-row-mapper";
import { completedTurn } from "./test-fixtures";

describe("SQLite session row mapper", () => {
	test("maps sessions to SQLite params with JSON snapshots", () => {
		const session = completedTurn("resp_1", null, undefined, "sqlite-test");

		expect(sessionToSQLiteParams(session)).toEqual({
			id: "resp_1",
			previous_response_id: null,
			conversation_id: null,
			created_at: 1_764_000_000,
			completed_at: 1_764_000_001,
			status: "completed",
			request_json: JSON.stringify(session.request),
			response_json: JSON.stringify(session.response),
			metadata_json: JSON.stringify(session.metadata),
		});
	});

	test("maps undefined metadata to null", () => {
		const session = completedTurn("resp_no_metadata", null);
		delete session.metadata;

		expect(sessionToSQLiteParams(session).metadata_json).toBeNull();
	});

	test("maps SQLite rows back to stored sessions", () => {
		const session = completedTurn("resp_1", "resp_parent");
		const row = sessionToSQLiteParams(session);

		expect(sqliteRowToSession(row)).toEqual(session);
	});

	test("omits metadata when SQLite metadata column is null", () => {
		const session = sqliteRowToSession({
			...sessionToSQLiteParams(completedTurn("resp_no_metadata", null)),
			metadata_json: null,
		});

		expect(session).not.toHaveProperty("metadata");
	});
});
