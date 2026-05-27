import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveResponseSessionChain } from "./chain";
import { assertCanSaveSession } from "./save-policy";
import {
	type SQLiteResponseSessionParams,
	type SQLiteResponseSessionRow,
	sessionToSQLiteParams,
	sqliteRowToSession,
} from "./sqlite-row-mapper";
import { migrateResponseSessionSchema } from "./sqlite-schema";
import type {
	ResolveResponseSessionOptions,
	ResponseId,
	ResponseSessionSnapshot,
	ResponseSessionStore,
	SaveResponseSessionOptions,
	StoredResponseSession,
} from "./types";

type SQLiteNamedBindings = Record<string, string | number | null>;

function toSQLiteNamedBindings(
	params: SQLiteResponseSessionParams,
): SQLiteNamedBindings {
	return params as unknown as SQLiteNamedBindings;
}

/**
 * SQLite-backed session store for Responses `previous_response_id` chains.
 *
 * The store keeps API-shaped request/response snapshots as JSON and performs
 * chain validation locally. It does not adapt items into provider messages.
 */
export class SQLiteResponseSessionStore implements ResponseSessionStore {
	readonly db: Database;
	private readonly ownsDatabase: boolean;

	constructor(database: Database | string = ":memory:") {
		if (typeof database === "string") {
			if (database !== ":memory:") {
				const dir = dirname(database);
				mkdirSync(dir, { recursive: true });
			}
			this.db = new Database(database, {
				create: true,
				readwrite: true,
				strict: true,
			});
			this.ownsDatabase = true;
		} else {
			this.db = database;
			this.ownsDatabase = false;
		}

		migrateResponseSessionSchema(this.db);
	}

	async get(responseId: ResponseId): Promise<StoredResponseSession | null> {
		return this.getSync(responseId);
	}

	async save(
		session: StoredResponseSession,
		options?: SaveResponseSessionOptions,
	): Promise<void> {
		const existing = this.getSync(session.id);
		assertCanSaveSession({ session, existing, options });

		this.db
			.query(
				`INSERT INTO response_sessions (
          id,
          previous_response_id,
          conversation_id,
          created_at,
          completed_at,
          status,
          request_json,
          response_json,
          metadata_json
        ) VALUES (
          $id,
          $previous_response_id,
          $conversation_id,
          $created_at,
          $completed_at,
          $status,
          $request_json,
          $response_json,
          $metadata_json
        )
        ON CONFLICT(id) DO UPDATE SET
          previous_response_id = excluded.previous_response_id,
          conversation_id = excluded.conversation_id,
          created_at = excluded.created_at,
          completed_at = excluded.completed_at,
          status = excluded.status,
          request_json = excluded.request_json,
          response_json = excluded.response_json,
          metadata_json = excluded.metadata_json`,
			)
			.run(toSQLiteNamedBindings(sessionToSQLiteParams(session)));
	}

	async resolveChain(
		previousResponseId: ResponseId,
		options?: ResolveResponseSessionOptions,
	): Promise<ResponseSessionSnapshot> {
		return resolveResponseSessionChain(previousResponseId, {
			...options,
			get: (responseId) => this.getSync(responseId),
		});
	}

	async delete(responseId: ResponseId): Promise<void> {
		this.db
			.query("DELETE FROM response_sessions WHERE id = $id")
			.run({ id: responseId });
	}

	close(): void {
		if (this.ownsDatabase) {
			this.db.close();
		}
	}

	private getSync(responseId: ResponseId): StoredResponseSession | null {
		const row = this.db
			.query<SQLiteResponseSessionRow, { id: string }>(
				`SELECT
          id,
          previous_response_id,
          conversation_id,
          created_at,
          completed_at,
          status,
          request_json,
          response_json,
          metadata_json
        FROM response_sessions
        WHERE id = $id`,
			)
			.get({ id: responseId });

		return row ? sqliteRowToSession(row) : null;
	}
}
