import { describe, expect, test } from "bun:test";
import { AsyncTraceRecorder, NoopTraceRecorder } from "./recorder";
import type { TraceStoreRow } from "./sqlite";
import type { TraceRecordEvent } from "./types";

function requestEvent(
	id = "req_1",
): Extract<TraceRecordEvent, { kind: "event" }> {
	return {
		kind: "event",
		request_id: id,
		response_id: "resp_1",
		provider: "zhipu",
		model: "glm-test",
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

	test("record does not synchronously call insertBatch when batchSize is reached", () => {
		let insertCalled = false;
		const recorder = new AsyncTraceRecorder({
			maxQueueSize: 10,
			batchSize: 1,
			flushIntervalMs: 60_000,
			capturePayload: false,
			payloadMaxBytes: 1024,
			logger: { warn: () => {} },
			store: {
				insertBatch: async () => {
					insertCalled = true;
				},
				close: () => {},
			},
		});
		recorder.record(requestEvent("req_1"));
		expect(insertCalled).toBe(false);
		recorder.close();
	});

	test("close waits for in-flight flush before closing store", async () => {
		let deferredResolve: () => void = () => {};
		const deferred = new Promise<void>((resolve) => {
			deferredResolve = resolve;
		});
		let storeClosed = false;
		const steps: string[] = [];
		const recorder = new AsyncTraceRecorder({
			maxQueueSize: 10,
			batchSize: 1,
			flushIntervalMs: 60_000,
			capturePayload: false,
			payloadMaxBytes: 1024,
			logger: { warn: () => {} },
			store: {
				insertBatch: async () => {
					steps.push("insert-started");
					await deferred;
					steps.push("insert-completed");
				},
				close: () => {
					steps.push("store-closed");
					storeClosed = true;
				},
			},
		});
		recorder.record(requestEvent("req_1"));
		// Give the scheduled flush a tick to start
		await new Promise((r) => setTimeout(r, 1));
		const closePromise = recorder.close();
		expect(storeClosed).toBe(false);
		deferredResolve();
		await closePromise;
		expect(storeClosed).toBe(true);
		expect(steps).toEqual([
			"insert-started",
			"insert-completed",
			"store-closed",
		]);
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

	test("keeps trace row metadata when payload serialization fails", async () => {
		const warnings: string[] = [];
		const batches: TraceStoreRow[][] = [];
		const payload: Record<string, unknown> = {};
		payload.self = payload;
		const recorder = new AsyncTraceRecorder({
			maxQueueSize: 10,
			batchSize: 1,
			flushIntervalMs: 60_000,
			capturePayload: true,
			payloadMaxBytes: 1024,
			logger: { warn: (event) => warnings.push(event) },
			store: {
				insertBatch: async (rows) => {
					batches.push(rows);
				},
				close: () => {},
			},
		});

		recorder.record({
			...requestEvent("req_circular"),
			payload: { payload },
		});
		await recorder.close();

		expect(batches.flat()).toHaveLength(1);
		expect(batches.flat()[0]).toMatchObject({
			table: "events",
			request_id: "req_circular",
			payload_hash: null,
			payload_bytes: null,
			payload_json: null,
			payload_truncated: false,
		});
		expect(warnings).toContain("trace.payload.serialize.error");
	});
});
