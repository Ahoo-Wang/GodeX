import { describe, expect, test } from "bun:test";
import { SQLiteTraceStore, type TraceStoreRow } from "./sqlite";

describe("SQLiteTraceStore", () => {
	test("creates trace tables and indexes", () => {
		const store = new SQLiteTraceStore(":memory:");
		const tables = store.db
			.query<{ name: string }, []>(
				"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
			)
			.all()
			.map((row) => row.name);
		expect(tables).toContain("trace_events");
		expect(tables).toContain("trace_errors");
		expect(tables).toContain("trace_requests");
		expect(tables).toContain("trace_usage");
		const requestColumns = store.db
			.query<{ name: string }, []>("PRAGMA table_info(trace_requests)")
			.all()
			.map((row) => row.name);
		expect(requestColumns).toEqual([
			"id",
			"request_id",
			"response_id",
			"provider",
			"model",
			"stream",
			"created_at",
			"requested_prompt_cache_key",
			"payload_hash",
			"payload_bytes",
			"payload_json",
			"payload_truncated",
		]);
		const usageColumns = store.db
			.query<{ name: string }, []>("PRAGMA table_info(trace_usage)")
			.all()
			.map((row) => row.name);
		expect(usageColumns).toEqual([
			"id",
			"request_id",
			"response_id",
			"provider",
			"model",
			"created_at",
			"input_tokens",
			"output_tokens",
			"total_tokens",
			"cached_tokens",
			"reasoning_tokens",
			"cache_hit_ratio",
		]);
		const errorColumns = store.db
			.query<{ name: string }, []>("PRAGMA table_info(trace_errors)")
			.all()
			.map((row) => row.name);
		expect(errorColumns).toEqual([
			"id",
			"request_id",
			"response_id",
			"provider",
			"model",
			"event_name",
			"error_type",
			"domain",
			"code",
			"message",
			"status",
			"created_at",
			"payload_hash",
			"payload_bytes",
			"payload_json",
			"payload_truncated",
		]);
		const indexes = store.db
			.query<{ name: string }, []>(
				"SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name",
			)
			.all()
			.map((row) => row.name);
		expect(indexes).toContain("idx_trace_requests_request_id");
		expect(indexes).toContain("idx_trace_events_request_id_sequence");
		expect(indexes).toContain("idx_trace_errors_request_id");
		store.close();
	});

	test("inserts request, usage, event, and error rows", async () => {
		const store = new SQLiteTraceStore(":memory:");
		await store.insertBatch([
			{
				table: "requests",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "zhipu",
				model: "glm-test",
				stream: false,
				created_at: 1000,
				requested_prompt_cache_key: "client-key",
				payload_hash: "hash",
				payload_bytes: 2,
				payload_json: null,
				payload_truncated: false,
			},
			{
				table: "usage",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "zhipu",
				model: "glm-test",
				created_at: 1001,
				input_tokens: 100,
				output_tokens: 20,
				total_tokens: 120,
				cached_tokens: 40,
				reasoning_tokens: 8,
				cache_hit_ratio: 0.4,
			},
			{
				table: "events",
				request_id: "req_1",
				response_id: "resp_1",
				event_name: "provider.response.body",
				sequence: 1,
				created_at: 1002,
				payload_hash: "hash2",
				payload_bytes: 3,
				payload_json: "{}",
				payload_truncated: false,
			},
			{
				table: "errors",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "zhipu",
				model: "glm-test",
				event_name: "responses.request.provider.error",
				error_type: "ProviderError",
				domain: "provider",
				code: "provider.upstream.error",
				message: "Upstream failed",
				status: 502,
				created_at: 1003,
				payload_hash: "hash3",
				payload_bytes: 4,
				payload_json: '{"upstreamStatus":400}',
				payload_truncated: false,
			},
		]);
		expect(
			store.db
				.query(
					"SELECT count(*) AS count, requested_prompt_cache_key FROM trace_requests",
				)
				.get(),
		).toMatchObject({ count: 1, requested_prompt_cache_key: "client-key" });
		expect(
			store.db
				.query("SELECT cached_tokens, reasoning_tokens FROM trace_usage")
				.get(),
		).toMatchObject({ cached_tokens: 40, reasoning_tokens: 8 });
		expect(
			store.db.query("SELECT event_name FROM trace_events").get(),
		).toMatchObject({ event_name: "provider.response.body" });
		expect(
			store.db
				.query(
					"SELECT event_name, code, status, payload_json FROM trace_errors",
				)
				.get(),
		).toMatchObject({
			event_name: "responses.request.provider.error",
			code: "provider.upstream.error",
			status: 502,
			payload_json: '{"upstreamStatus":400}',
		});
		store.close();
	});

	test("coalesces omitted optional usage and event fields to null", async () => {
		const store = new SQLiteTraceStore(":memory:");
		const rows = [
			{
				table: "usage",
				request_id: "req_optional",
				response_id: "resp_optional",
				provider: "zhipu",
				model: "glm-test",
				created_at: 2001,
			},
			{
				table: "events",
				request_id: "req_optional",
				response_id: "resp_optional",
				event_name: "provider.response.body",
				sequence: 1,
				created_at: 2002,
			},
		] as unknown as TraceStoreRow[];

		await store.insertBatch(rows);

		expect(
			store.db
				.query(
					"SELECT cached_tokens, reasoning_tokens, cache_hit_ratio FROM trace_usage",
				)
				.get(),
		).toEqual({
			cached_tokens: null,
			reasoning_tokens: null,
			cache_hit_ratio: null,
		});
		expect(
			store.db
				.query(
					`SELECT payload_hash, payload_bytes, payload_json, payload_truncated
					FROM trace_events`,
				)
				.get(),
		).toEqual({
			payload_hash: null,
			payload_bytes: null,
			payload_json: null,
			payload_truncated: 0,
		});
		store.close();
	});
});
