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
	test("maps request records with provider payload metadata", () => {
		const event: TraceRecordEvent = {
			kind: "request",
			request_id: "req_1",
			response_id: "resp_1",
			provider: "zhipu",
			model: "glm-5.1",
			stream: true,
			created_at: 1000,
			requested_prompt_cache_key: "client-key",
			payload: { payload: { model: "glm-5.1" } },
		};

		const row = mapTraceRecordToRow(event, mapperOptions());

		expect(row).toMatchObject({
			table: "requests",
			request_id: "req_1",
			response_id: "resp_1",
			provider: "zhipu",
			model: "glm-5.1",
			stream: true,
			requested_prompt_cache_key: "client-key",
			payload_json: '{"model":"glm-5.1"}',
			payload_truncated: false,
		});
	});

	test("maps normalized usage records", () => {
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
					reasoning_tokens: 8,
					cache_hit_ratio: 0.4,
				},
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
			reasoning_tokens: 8,
			cache_hit_ratio: 0.4,
		});
	});

	test("maps error records with serializable diagnostic payload", () => {
		const row = mapTraceRecordToRow(
			{
				kind: "error",
				request_id: "req_failed",
				response_id: "resp_failed",
				provider: "deepseek",
				model: "deepseek-v4-pro",
				created_at: 1003,
				event_name: "responses.request.provider.error",
				error_type: "ProviderError",
				domain: "provider",
				code: "provider.upstream.error",
				message: "Upstream failed",
				status: 502,
				payload: {
					payload: {
						upstreamStatus: 400,
						upstreamBody: { error: { message: "bad request" } },
					},
				},
			} as unknown as TraceRecordEvent,
			mapperOptions(),
		);

		expect(row).toMatchObject({
			table: "errors",
			request_id: "req_failed",
			response_id: "resp_failed",
			provider: "deepseek",
			model: "deepseek-v4-pro",
			event_name: "responses.request.provider.error",
			error_type: "ProviderError",
			domain: "provider",
			code: "provider.upstream.error",
			message: "Upstream failed",
			status: 502,
			payload_json:
				'{"upstreamStatus":400,"upstreamBody":{"error":{"message":"bad request"}}}',
			payload_truncated: false,
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
