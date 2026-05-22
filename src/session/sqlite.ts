import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SESSION_CONFLICT, SessionError } from "../error";
import type { ResponseStatus } from "../protocol/openai/responses";
import { resolveResponseSessionChain } from "./chain";
import type {
	ResolveResponseSessionOptions,
	ResponseId,
	ResponseSessionSnapshot,
	ResponseSessionStore,
	SaveResponseSessionOptions,
	StoredResponseRequestSnapshot,
	StoredResponseSession,
	StoredResponseSnapshot,
} from "./types";

interface SQLiteResponseSessionRow {
	id: string;
	previous_response_id: string | null;
	conversation_id: string | null;
	created_at: number;
	completed_at: number | null;
	status: ResponseStatus;
	request_json: string;
	response_json: string;
	metadata_json: string | null;
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

		this.migrate();
	}

	async get(responseId: ResponseId): Promise<StoredResponseSession | null> {
		return this.getSync(responseId);
	}

	async save(
		session: StoredResponseSession,
		options?: SaveResponseSessionOptions,
	): Promise<void> {
		const previousResponseId = session.previous_response_id ?? null;

		if (
			options?.expected_previous_response_id !== undefined &&
			options.expected_previous_response_id !== previousResponseId
		) {
			throw new SessionError(
				SESSION_CONFLICT,
				"Response session parent did not match expected previous response ID.",
				{
					responseId: session.id,
					previousResponseId: previousResponseId ?? undefined,
				},
			);
		}

		const existing = this.getSync(session.id);
		if (existing && !options?.overwrite) {
			throw new SessionError(
				SESSION_CONFLICT,
				"Response session already exists.",
				{
					responseId: session.id,
					previousResponseId: previousResponseId ?? undefined,
				},
			);
		}

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
			.run({
				id: session.id,
				previous_response_id: previousResponseId,
				conversation_id: session.conversation_id ?? null,
				created_at: session.created_at,
				completed_at: session.completed_at ?? null,
				status: session.status,
				request_json: JSON.stringify(session.request),
				response_json: JSON.stringify(session.response),
				metadata_json:
					session.metadata === undefined
						? null
						: JSON.stringify(session.metadata),
			});
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
		if (this.ownsDatabase && this.db) {
			this.db.close();
		}
	}

	private migrate(): void {
		this.db.run(`
      CREATE TABLE IF NOT EXISTS response_sessions (
        id TEXT PRIMARY KEY,
        previous_response_id TEXT NULL,
        conversation_id TEXT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER NULL,
        status TEXT NOT NULL,
        request_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        metadata_json TEXT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_response_sessions_previous_response_id
        ON response_sessions(previous_response_id);

      CREATE INDEX IF NOT EXISTS idx_response_sessions_conversation_id
        ON response_sessions(conversation_id);
    `);
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

		return row ? rowToSession(row) : null;
	}
}

function rowToSession(row: SQLiteResponseSessionRow): StoredResponseSession {
	const session: StoredResponseSession = {
		id: row.id,
		previous_response_id: row.previous_response_id,
		conversation_id: row.conversation_id,
		created_at: row.created_at,
		completed_at: row.completed_at,
		status: row.status,
		request: JSON.parse(row.request_json) as StoredResponseRequestSnapshot,
		response: JSON.parse(row.response_json) as StoredResponseSnapshot,
	};

	if (row.metadata_json !== null) {
		session.metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
	}

	return session;
}
