import type { ResponseStatus } from "../protocol/openai/responses";
import type {
	StoredResponseRequestSnapshot,
	StoredResponseSession,
	StoredResponseSnapshot,
} from "./types";

export interface SQLiteResponseSessionRow {
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

export type SQLiteResponseSessionParams = SQLiteResponseSessionRow;

export function sessionToSQLiteParams(
	session: StoredResponseSession,
): SQLiteResponseSessionParams {
	return {
		id: session.id,
		previous_response_id: session.previous_response_id ?? null,
		conversation_id: session.conversation_id ?? null,
		created_at: session.created_at,
		completed_at: session.completed_at ?? null,
		status: session.status,
		request_json: JSON.stringify(session.request),
		response_json: JSON.stringify(session.response),
		metadata_json:
			session.metadata === undefined ? null : JSON.stringify(session.metadata),
	};
}

export function sqliteRowToSession(
	row: SQLiteResponseSessionRow,
): StoredResponseSession {
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
