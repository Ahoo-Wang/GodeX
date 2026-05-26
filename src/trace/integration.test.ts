import { describe, expect, test } from "bun:test";
import { recordTraceUsage } from "./integration";

describe("recordTraceUsage", () => {
	test("records cached token usage", () => {
		const events: unknown[] = [];
		const ctx = {
			requestId: "req_1",
			responseId: "resp_1",
			resolved: { provider: "openai", model: "gpt-test" },
			app: {
				traceRecorder: { record: (event: unknown) => events.push(event) },
			},
		};
		recordTraceUsage(ctx as never, {
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			input_tokens_details: { cached_tokens: 40 },
		});
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: "usage",
			usage: { cached_tokens: 40, cache_hit_ratio: 0.4 },
		});
	});
});
