import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type TraceStoreRow =
	| ({ table: "requests" } & TraceRequestRow)
	| ({ table: "usage" } & TraceUsageRow)
	| ({ table: "events" } & TraceEventRow)
	| ({ table: "errors" } & TraceErrorRow);

export interface TraceRequestRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	stream: boolean;
	created_at: number;
	requested_prompt_cache_key?: string | null;
	payload_hash?: string | null;
	payload_bytes?: number | null;
	payload_json?: string | null;
	payload_truncated: boolean;
}

export interface TraceUsageRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	created_at: number;
	input_tokens?: number | null;
	output_tokens?: number | null;
	total_tokens?: number | null;
	cached_tokens?: number | null;
	reasoning_tokens?: number | null;
	cache_hit_ratio?: number | null;
}

export interface TraceEventRow {
	request_id: string;
	response_id: string;
	event_name: string;
	sequence: number;
	created_at: number;
	payload_hash?: string | null;
	payload_bytes?: number | null;
	payload_json?: string | null;
	payload_truncated: boolean;
}

export interface TraceErrorRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	event_name: string;
	error_type?: string | null;
	domain?: string | null;
	code: string;
	message: string;
	status?: number | null;
	created_at: number;
	payload_hash?: string | null;
	payload_bytes?: number | null;
	payload_json?: string | null;
	payload_truncated: boolean;
}

export class SQLiteTraceStore {
	readonly db: Database;
	private readonly ownsDatabase: boolean;

	constructor(database: Database | string = ":memory:") {
		if (typeof database === "string") {
			if (database !== ":memory:")
				mkdirSync(dirname(database), { recursive: true });
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

	async insertBatch(rows: TraceStoreRow[]): Promise<void> {
		if (rows.length === 0) return;
		this.db.transaction(() => {
			for (const row of rows) this.insertRow(row);
		})();
	}

	close(): void {
		if (this.ownsDatabase) this.db.close();
	}

	private migrate(): void {
		this.db.run(`
            CREATE TABLE IF NOT EXISTS trace_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                response_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                stream INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                requested_prompt_cache_key TEXT NULL,
                payload_hash TEXT NULL,
                payload_bytes INTEGER NULL,
                payload_json TEXT NULL,
                payload_truncated INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_trace_requests_request_id
                ON trace_requests(request_id);
            CREATE INDEX IF NOT EXISTS idx_trace_requests_response_id
                ON trace_requests(response_id);
            CREATE TABLE IF NOT EXISTS trace_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                response_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                input_tokens INTEGER NULL,
                output_tokens INTEGER NULL,
                total_tokens INTEGER NULL,
                cached_tokens INTEGER NULL,
                reasoning_tokens INTEGER NULL,
                cache_hit_ratio REAL NULL
            );
            CREATE INDEX IF NOT EXISTS idx_trace_usage_request_id
                ON trace_usage(request_id);
            CREATE INDEX IF NOT EXISTS idx_trace_usage_response_id
                ON trace_usage(response_id);
            CREATE TABLE IF NOT EXISTS trace_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                response_id TEXT NOT NULL,
                event_name TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                payload_hash TEXT NULL,
                payload_bytes INTEGER NULL,
                payload_json TEXT NULL,
                payload_truncated INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_trace_events_request_id_sequence
                ON trace_events(request_id, sequence);
            CREATE INDEX IF NOT EXISTS idx_trace_events_event_name
                ON trace_events(event_name);
            CREATE TABLE IF NOT EXISTS trace_errors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                response_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                event_name TEXT NOT NULL,
                error_type TEXT NULL,
                domain TEXT NULL,
                code TEXT NOT NULL,
                message TEXT NOT NULL,
                status INTEGER NULL,
                created_at INTEGER NOT NULL,
                payload_hash TEXT NULL,
                payload_bytes INTEGER NULL,
                payload_json TEXT NULL,
                payload_truncated INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_trace_errors_request_id
                ON trace_errors(request_id);
            CREATE INDEX IF NOT EXISTS idx_trace_errors_response_id
                ON trace_errors(response_id);
            CREATE INDEX IF NOT EXISTS idx_trace_errors_code
                ON trace_errors(code);
        `);
	}

	private insertRow(row: TraceStoreRow): void {
		if (row.table === "requests") {
			const { table: _table, ...values } = row;
			this.db
				.query(
					`INSERT INTO trace_requests (
                    request_id, response_id, provider, model, stream, created_at,
                    requested_prompt_cache_key, payload_hash, payload_bytes,
                    payload_json, payload_truncated
                ) VALUES (
                    $request_id, $response_id, $provider, $model, $stream, $created_at,
                    $requested_prompt_cache_key, $payload_hash, $payload_bytes,
                    $payload_json, $payload_truncated
                )`,
				)
				.run({
					request_id: values.request_id,
					response_id: values.response_id,
					provider: values.provider,
					model: values.model,
					stream: values.stream ? 1 : 0,
					created_at: values.created_at,
					requested_prompt_cache_key: values.requested_prompt_cache_key ?? null,
					payload_hash: values.payload_hash ?? null,
					payload_bytes: values.payload_bytes ?? null,
					payload_json: values.payload_json ?? null,
					payload_truncated: values.payload_truncated ? 1 : 0,
				});
			return;
		}
		if (row.table === "usage") {
			const { table: _table, ...values } = row;
			this.db
				.query(
					`INSERT INTO trace_usage (
                    request_id, response_id, provider, model, created_at,
                    input_tokens, output_tokens, total_tokens, cached_tokens,
                    reasoning_tokens, cache_hit_ratio
                ) VALUES (
                    $request_id, $response_id, $provider, $model, $created_at,
                    $input_tokens, $output_tokens, $total_tokens, $cached_tokens,
                    $reasoning_tokens, $cache_hit_ratio
	                )`,
				)
				.run({
					request_id: values.request_id,
					response_id: values.response_id,
					provider: values.provider,
					model: values.model,
					created_at: values.created_at,
					input_tokens: values.input_tokens ?? null,
					output_tokens: values.output_tokens ?? null,
					total_tokens: values.total_tokens ?? null,
					cached_tokens: values.cached_tokens ?? null,
					reasoning_tokens: values.reasoning_tokens ?? null,
					cache_hit_ratio: values.cache_hit_ratio ?? null,
				});
			return;
		}
		if (row.table === "events") {
			const { table: _table, ...values } = row;
			this.db
				.query(
					`INSERT INTO trace_events (
                request_id, response_id, event_name, sequence, created_at,
                payload_hash, payload_bytes, payload_json, payload_truncated
            ) VALUES (
                $request_id, $response_id, $event_name, $sequence, $created_at,
                $payload_hash, $payload_bytes, $payload_json, $payload_truncated
            )`,
				)
				.run({
					request_id: values.request_id,
					response_id: values.response_id,
					event_name: values.event_name,
					sequence: values.sequence ?? 0,
					created_at: values.created_at,
					payload_hash: values.payload_hash ?? null,
					payload_bytes: values.payload_bytes ?? null,
					payload_json: values.payload_json ?? null,
					payload_truncated: values.payload_truncated ? 1 : 0,
				});
			return;
		}
		const { table: _table, ...values } = row;
		this.db
			.query(
				`INSERT INTO trace_errors (
                request_id, response_id, provider, model, event_name,
                error_type, domain, code, message, status, created_at,
                payload_hash, payload_bytes, payload_json, payload_truncated
            ) VALUES (
                $request_id, $response_id, $provider, $model, $event_name,
                $error_type, $domain, $code, $message, $status, $created_at,
                $payload_hash, $payload_bytes, $payload_json, $payload_truncated
            )`,
			)
			.run({
				request_id: values.request_id,
				response_id: values.response_id,
				provider: values.provider,
				model: values.model,
				event_name: values.event_name,
				error_type: values.error_type ?? null,
				domain: values.domain ?? null,
				code: values.code,
				message: values.message,
				status: values.status ?? null,
				created_at: values.created_at,
				payload_hash: values.payload_hash ?? null,
				payload_bytes: values.payload_bytes ?? null,
				payload_json: values.payload_json ?? null,
				payload_truncated: values.payload_truncated ? 1 : 0,
			});
	}
}
