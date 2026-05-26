import { describe, expect, test } from "bun:test";
import { AsyncTraceRecorder, NoopTraceRecorder } from "./recorder";
import type { TraceRecordEvent } from "./types";

function requestEvent(id = "req_1"): TraceRecordEvent {
	return {
		kind: "event",
		request_id: id,
		response_id: "resp_1",
		provider: "openai",
		model: "gpt-test",
		created_at: Date.now(),
		event_name: "provider.request.body",
		payload: { payload: { ok: true } },
	};
}

describe("TraceRecorder", () => {
	test("noop recorder does not throw", () => {
		const recorder = new NoopTraceRecorder();
		expect(() => recorder.record(requestEvent())).not.toThrow();
	});

	test("record returns synchronously and flushes batches", async () => {
		const batches: Array<Array<{ request_id: string }>> = [];
		const recorder = new AsyncTraceRecorder({
			maxQueueSize: 10,
			batchSize: 2,
			flushIntervalMs: 60_000,
			capturePayload: false,
			payloadMaxBytes: 1024,
			logger: { warn: () => {} },
			store: {
				insertBatch: async (rows) => {
					batches.push(rows.map((row) => ({ request_id: row.request_id })));
				},
				close: () => {},
			},
		});
		recorder.record(requestEvent("req_1"));
		recorder.record(requestEvent("req_2"));
		await recorder.close();
		expect(batches.flat().map((event) => event.request_id)).toEqual([
			"req_1",
			"req_2",
		]);
	});

	test("drops records when queue is full and warns", () => {
		const warnings: string[] = [];
		const recorder = new AsyncTraceRecorder({
			maxQueueSize: 1,
			batchSize: 10,
			flushIntervalMs: 60_000,
			capturePayload: false,
			payloadMaxBytes: 1024,
			logger: { warn: (event) => warnings.push(event) },
			store: { insertBatch: async () => {}, close: () => {} },
		});
		recorder.record(requestEvent("req_1"));
		recorder.record(requestEvent("req_2"));
		expect(warnings).toContain("trace.queue.full");
		recorder.close();
	});

	test("warns instead of throwing when store flush fails", async () => {
		const warnings: string[] = [];
		const recorder = new AsyncTraceRecorder({
			maxQueueSize: 10,
			batchSize: 1,
			flushIntervalMs: 60_000,
			capturePayload: false,
			payloadMaxBytes: 1024,
			logger: { warn: (event) => warnings.push(event) },
			store: {
				insertBatch: async () => {
					throw new Error("disk full");
				},
				close: () => {},
			},
		});
		expect(() => recorder.record(requestEvent("req_1"))).not.toThrow();
		await recorder.close();
		expect(warnings).toContain("trace.flush.error");
	});
});
