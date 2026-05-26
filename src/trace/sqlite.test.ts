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
		expect(tables).toContain("trace_requests");
		expect(tables).toContain("trace_usage");
		const indexes = store.db
			.query<{ name: string }, []>(
				"SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name",
			)
			.all()
			.map((row) => row.name);
		expect(indexes).toContain("idx_trace_requests_requested_cache_identity");
		expect(indexes).toContain("idx_trace_events_request_id_sequence");
		store.close();
	});

	test("inserts request, usage, and event rows", async () => {
		const store = new SQLiteTraceStore(":memory:");
		await store.insertBatch([
			{
				table: "requests",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "openai",
				model: "gpt-test",
				stream: false,
				created_at: 1000,
				requested_prompt_cache_key: "client-key",
				prompt_cache_key: "client-key",
				prefix_hash: "abc",
				prefix_bytes: 10,
				cache_risk_level: "none",
				cache_risk_reasons_json: "[]",
				tool_fingerprint_json: null,
				passthrough_json: '{"prompt_cache_key":true}',
				payload_hash: "hash",
				payload_bytes: 2,
				payload_json: null,
				payload_truncated: false,
			},
			{
				table: "usage",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "openai",
				model: "gpt-test",
				created_at: 1001,
				input_tokens: 100,
				output_tokens: 20,
				total_tokens: 120,
				cached_tokens: 40,
				cache_hit_ratio: 0.4,
				cache_creation_input_tokens: 12,
				cache_read_input_tokens: 34,
				raw_usage_json: '{"total_tokens":120}',
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
		]);
		expect(
			store.db.query("SELECT count(*) AS count FROM trace_requests").get(),
		).toMatchObject({ count: 1 });
		expect(
			store.db.query("SELECT cached_tokens FROM trace_usage").get(),
		).toMatchObject({ cached_tokens: 40 });
		expect(
			store.db.query("SELECT event_name FROM trace_events").get(),
		).toMatchObject({ event_name: "provider.response.body" });
		store.close();
	});

	test("coalesces omitted optional usage and event fields to null", async () => {
		const store = new SQLiteTraceStore(":memory:");
		const rows = [
			{
				table: "usage",
				request_id: "req_optional",
				response_id: "resp_optional",
				provider: "openai",
				model: "gpt-test",
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
					`SELECT cached_tokens, cache_hit_ratio, cache_creation_input_tokens,
						cache_read_input_tokens, raw_usage_json
					FROM trace_usage`,
				)
				.get(),
		).toEqual({
			cached_tokens: null,
			cache_hit_ratio: null,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			raw_usage_json: null,
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
