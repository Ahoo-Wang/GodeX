import type { Database } from "bun:sqlite";

export function migrateResponseSessionSchema(db: Database): void {
	db.run(`
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
