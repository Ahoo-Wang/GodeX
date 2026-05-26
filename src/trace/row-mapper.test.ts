import { describe, expect, test } from "bun:test";
import { mapTraceRecordToRow } from "./row-mapper";
import type { TraceRecordEvent } from "./types";

function mapperOptions(warnings: string[] = []) {
	return {
		capturePayload: true,
		payloadMaxBytes: 1024,
		logger: { warn: (event: string) => warnings.push(event) },
	};
}

describe("mapTraceRecordToRow", () => {
	test("maps request records with prompt cache metadata", () => {
		const event: TraceRecordEvent = {
			kind: "request",
			request_id: "req_1",
			response_id: "resp_1",
			provider: "zhipu",
			model: "glm-5.1",
			stream: false,
			created_at: 1000,
			requested_prompt_cache_key: "client-key",
			requested_prompt_cache_retention: "24h",
			prompt_cache_key: "provider-key",
			prompt_cache_retention: "1h",
			cache_detection: {
				risk_level: "high",
				reasons: ["prompt_cache_key prefix changed"],
				prefix_hash: "prefix-hash",
				prefix_bytes: 42,
				tool_fingerprint: {
					names: ["exec_command"],
					hash: "tool-hash",
				},
				passthrough: {
					prompt_cache_key: false,
					prompt_cache_retention: true,
					cache_control: false,
				},
			},
			payload: { payload: { model: "glm-5.1" } },
		};

		const row = mapTraceRecordToRow(event, mapperOptions());

		expect(row).toMatchObject({
			table: "requests",
			request_id: "req_1",
			response_id: "resp_1",
			provider: "zhipu",
			model: "glm-5.1",
			stream: false,
			requested_prompt_cache_key: "client-key",
			requested_prompt_cache_retention: "24h",
			prompt_cache_key: "provider-key",
			prompt_cache_retention: "1h",
			prefix_hash: "prefix-hash",
			prefix_bytes: 42,
			cache_risk_level: "high",
			cache_risk_reasons_json: '["prompt_cache_key prefix changed"]',
			tool_fingerprint_json: '{"names":["exec_command"],"hash":"tool-hash"}',
			passthrough_json:
				'{"prompt_cache_key":false,"prompt_cache_retention":true,"cache_control":false}',
			payload_json: '{"model":"glm-5.1"}',
			payload_truncated: false,
		});
	});

	test("maps usage records with provider raw usage", () => {
		const row = mapTraceRecordToRow(
			{
				kind: "usage",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "zhipu",
				model: "glm-5.1",
				created_at: 1001,
				usage: {
					input_tokens: 100,
					output_tokens: 20,
					total_tokens: 120,
					cached_tokens: 40,
					cache_hit_ratio: 0.4,
					cache_creation_input_tokens: 12,
					cache_read_input_tokens: 34,
				},
				raw_usage: { prompt_tokens: 100 },
			},
			mapperOptions(),
		);

		expect(row).toMatchObject({
			table: "usage",
			request_id: "req_1",
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			cached_tokens: 40,
			cache_hit_ratio: 0.4,
			cache_creation_input_tokens: 12,
			cache_read_input_tokens: 34,
			raw_usage_json: '{"prompt_tokens":100}',
		});
	});

	test("keeps event row metadata when payload serialization fails", () => {
		const warnings: string[] = [];
		const payload: Record<string, unknown> = {};
		payload.self = payload;

		const row = mapTraceRecordToRow(
			{
				kind: "event",
				request_id: "req_circular",
				response_id: "resp_1",
				provider: "zhipu",
				model: "glm-5.1",
				created_at: 1002,
				event_name: "provider.request.body",
				sequence: 7,
				payload: { payload },
			},
			mapperOptions(warnings),
		);

		expect(row).toMatchObject({
			table: "events",
			request_id: "req_circular",
			response_id: "resp_1",
			event_name: "provider.request.body",
			sequence: 7,
			payload_hash: null,
			payload_bytes: null,
			payload_json: null,
			payload_truncated: false,
		});
		expect(warnings).toContain("trace.payload.serialize.error");
	});
});
