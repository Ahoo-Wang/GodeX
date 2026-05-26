import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type TraceStoreRow =
	| ({ table: "requests" } & TraceRequestRow)
	| ({ table: "usage" } & TraceUsageRow)
	| ({ table: "events" } & TraceEventRow);

export interface TraceRequestRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	stream: boolean;
	created_at: number;
	requested_prompt_cache_key?: string | null;
	requested_prompt_cache_retention?: string | null;
	prompt_cache_key?: string | null;
	prompt_cache_retention?: string | null;
	prefix_hash?: string | null;
	prefix_bytes?: number | null;
	cache_risk_level?: string | null;
	cache_risk_reasons_json?: string | null;
	tool_fingerprint_json?: string | null;
	passthrough_json?: string | null;
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
	cache_hit_ratio?: number | null;
	cache_creation_input_tokens?: number | null;
	cache_read_input_tokens?: number | null;
	raw_usage_json?: string | null;
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
                requested_prompt_cache_retention TEXT NULL,
                prompt_cache_key TEXT NULL,
                prompt_cache_retention TEXT NULL,
                prefix_hash TEXT NULL,
                prefix_bytes INTEGER NULL,
                cache_risk_level TEXT NULL,
                cache_risk_reasons_json TEXT NULL,
                tool_fingerprint_json TEXT NULL,
                passthrough_json TEXT NULL,
                payload_hash TEXT NULL,
                payload_bytes INTEGER NULL,
                payload_json TEXT NULL,
                payload_truncated INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_trace_requests_request_id
                ON trace_requests(request_id);
            CREATE INDEX IF NOT EXISTS idx_trace_requests_requested_cache_identity
                ON trace_requests(provider, model, requested_prompt_cache_key, created_at);
            CREATE INDEX IF NOT EXISTS idx_trace_requests_provider_cache_identity
                ON trace_requests(provider, model, prompt_cache_key, created_at);
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
                cache_hit_ratio REAL NULL,
                cache_creation_input_tokens INTEGER NULL,
                cache_read_input_tokens INTEGER NULL,
                raw_usage_json TEXT NULL
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
        `);
	}

	private insertRow(row: TraceStoreRow): void {
		if (row.table === "requests") {
			const { table: _table, ...values } = row;
			this.db
				.query(
					`INSERT INTO trace_requests (
                    request_id, response_id, provider, model, stream, created_at,
                    requested_prompt_cache_key, requested_prompt_cache_retention,
                    prompt_cache_key, prompt_cache_retention, prefix_hash, prefix_bytes,
                    cache_risk_level, cache_risk_reasons_json, tool_fingerprint_json,
                    passthrough_json, payload_hash, payload_bytes, payload_json,
                    payload_truncated
                ) VALUES (
                    $request_id, $response_id, $provider, $model, $stream, $created_at,
                    $requested_prompt_cache_key, $requested_prompt_cache_retention,
                    $prompt_cache_key, $prompt_cache_retention, $prefix_hash, $prefix_bytes,
                    $cache_risk_level, $cache_risk_reasons_json, $tool_fingerprint_json,
                    $passthrough_json, $payload_hash, $payload_bytes, $payload_json,
                    $payload_truncated
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
					requested_prompt_cache_retention:
						values.requested_prompt_cache_retention ?? null,
					prompt_cache_key: values.prompt_cache_key ?? null,
					prompt_cache_retention: values.prompt_cache_retention ?? null,
					prefix_hash: values.prefix_hash ?? null,
					prefix_bytes: values.prefix_bytes ?? null,
					cache_risk_level: values.cache_risk_level ?? null,
					cache_risk_reasons_json: values.cache_risk_reasons_json ?? null,
					tool_fingerprint_json: values.tool_fingerprint_json ?? null,
					passthrough_json: values.passthrough_json ?? null,
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
                    cache_hit_ratio, cache_creation_input_tokens,
                    cache_read_input_tokens, raw_usage_json
                ) VALUES (
                    $request_id, $response_id, $provider, $model, $created_at,
                    $input_tokens, $output_tokens, $total_tokens, $cached_tokens,
                    $cache_hit_ratio, $cache_creation_input_tokens,
                    $cache_read_input_tokens, $raw_usage_json
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
					cache_hit_ratio: values.cache_hit_ratio ?? null,
					cache_creation_input_tokens:
						values.cache_creation_input_tokens ?? null,
					cache_read_input_tokens: values.cache_read_input_tokens ?? null,
					raw_usage_json: values.raw_usage_json ?? null,
				});
			return;
		}
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
	}
}
