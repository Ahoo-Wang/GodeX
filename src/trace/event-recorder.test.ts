import { describe, expect, test } from "bun:test";
import { recordTraceEvent } from "./event-recorder";

describe("recordTraceEvent", () => {
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

		recordTraceEvent(ctx, "provider.request.body", { model: "glm-test" });

		expect(events).toEqual([]);
	});

	test("records trace event rows with optional sequence", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			resolved: { provider: "zhipu", model: "glm-test" },
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};

		recordTraceEvent(ctx, "upstream.stream.event.raw", { chunk: true }, 7);

		expect(events).toEqual([
			expect.objectContaining({
				kind: "event",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "zhipu",
				model: "glm-test",
				event_name: "upstream.stream.event.raw",
				sequence: 7,
				payload: { payload: { chunk: true } },
			}),
		]);
	});
});
