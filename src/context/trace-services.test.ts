import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TraceConfig } from "../config";
import type { Logger } from "../logger";
import {
	NoopTraceRecorder,
	SQLiteTraceStore,
	type TraceRecorder,
} from "../trace";
import { createTraceServices } from "./trace-services";

const logger: Logger = {
	level: "error",
	child: () => logger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

const baseTrace: TraceConfig = {
	enabled: false,
	path: ":memory:",
	max_queue_size: 10,
	flush_interval_ms: 1000,
	batch_size: 100,
	capture_payload: false,
	payload_max_bytes: 65536,
};

type RecorderWithOptions = {
	options: {
		store: unknown;
		maxQueueSize: number;
		flushIntervalMs: number;
		batchSize: number;
		capturePayload: boolean;
		payloadMaxBytes: number;
	};
};

describe("createTraceServices", () => {
	test("creates noop recorder and prompt-cache services when trace is disabled", () => {
		const services = createTraceServices(baseTrace, logger);

		expect(services.traceEnabled).toBe(false);
		expect(services.traceRecorder).toBeInstanceOf(NoopTraceRecorder);
		expect(services.promptCacheRequestAnalyzer).toBeDefined();
		expect(services.promptCacheDetector).toBeDefined();
		expect(services.promptCacheObservationIndex).toBeDefined();
	});

	test("creates an async recorder when trace is enabled", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "godex-trace-services-"));
		const tracePath = join(tempDir, "trace.db");
		const traceConfig: TraceConfig = {
			...baseTrace,
			enabled: true,
			path: tracePath,
			max_queue_size: 23,
			flush_interval_ms: 456,
			batch_size: 7,
			capture_payload: true,
			payload_max_bytes: 8192,
		};
		let traceRecorder: TraceRecorder | undefined;

		try {
			const services = createTraceServices(traceConfig, logger);
			traceRecorder = services.traceRecorder;
			const recorder = services.traceRecorder as unknown as RecorderWithOptions;

			expect(services.traceEnabled).toBe(true);
			expect(services.traceRecorder).not.toBeInstanceOf(NoopTraceRecorder);
			expect(recorder.options.store).toBeInstanceOf(SQLiteTraceStore);
			expect(recorder.options.maxQueueSize).toBe(traceConfig.max_queue_size);
			expect(recorder.options.flushIntervalMs).toBe(
				traceConfig.flush_interval_ms,
			);
			expect(recorder.options.batchSize).toBe(traceConfig.batch_size);
			expect(recorder.options.capturePayload).toBe(traceConfig.capture_payload);
			expect(recorder.options.payloadMaxBytes).toBe(
				traceConfig.payload_max_bytes,
			);
			expect(existsSync(tracePath)).toBe(true);
		} finally {
			await traceRecorder?.close?.();
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test("uses at least 1000 prompt-cache observations", () => {
		const services = createTraceServices(
			{ ...baseTrace, max_queue_size: 1 },
			logger,
		);

		for (let i = 0; i < 1000; i++) {
			services.promptCacheObservationIndex.remember({
				provider: "zhipu",
				model: "glm",
				cache_identity_key: `key_${i}`,
				prefix_hash: `hash_${i}`,
				prefix_bytes: i,
				created_at: i,
				request_id: `req_${i}`,
			});
		}

		expect(
			services.promptCacheObservationIndex.get({
				provider: "zhipu",
				model: "glm",
				cache_identity_key: "key_0",
			}),
		).not.toBeNull();
	});
});
