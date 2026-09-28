import { describe, expect, test } from "bun:test";
import { ProviderError } from "../error";
import { recordTraceError } from "./error-recorder";

describe("recordTraceError", () => {
	test("does nothing when tracing is disabled", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			resolved: { provider: "zhipu", model: "glm-test" },
			app: {
				traceEnabled: false,
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};

		recordTraceError(ctx, "responses.request.error", new Error("boom"));

		expect(events).toEqual([]);
	});

	test("records normalized GodeX error details", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			resolved: { provider: "deepseek", model: "deepseek-v4-pro" },
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};
		const err = new ProviderError(
			"provider.upstream.error",
			"Upstream failed",
			{
				provider: "deepseek",
				model: "deepseek-v4-pro",
				upstreamStatus: 400,
			},
		);

		recordTraceError(ctx, "responses.request.provider.error", err);

		expect(events).toEqual([
			expect.objectContaining({
				kind: "error",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "deepseek",
				model: "deepseek-v4-pro",
				event_name: "responses.request.provider.error",
				error_type: "ProviderError",
				domain: "provider",
				code: "provider.upstream.error",
				message: "Upstream failed",
				status: 502,
				payload: {
					payload: expect.objectContaining({
						upstreamStatus: 400,
					}),
				},
			}),
		]);
	});
});
