import { describe, expect, test } from "bun:test";
import { recordTraceUsage } from "./usage-recorder";

describe("recordTraceUsage", () => {
	test("does nothing when tracing is disabled", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			resolved: { provider: "openai", model: "gpt-test" },
			app: {
				traceEnabled: false,
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};

		recordTraceUsage(ctx, {
			input_tokens: 1,
			output_tokens: 1,
			total_tokens: 2,
		});

		expect(events).toEqual([]);
	});

	test("records cached token usage", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			resolved: { provider: "openai", model: "gpt-test" },
			app: {
				traceEnabled: true,
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};

		recordTraceUsage(ctx, {
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			input_tokens_details: { cached_tokens: 40 },
		});

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: "usage",
			request_id: "req_1",
			response_id: "resp_1",
			provider: "openai",
			model: "gpt-test",
			usage: { cached_tokens: 40, cache_hit_ratio: 0.4 },
		});
	});
});
