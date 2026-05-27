import { describe, expect, test } from "bun:test";
import type { TraceConfig } from "../config";
import type { Logger } from "../logger";
import { NoopTraceRecorder } from "../trace";
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
		const services = createTraceServices(
			{ ...baseTrace, enabled: true, path: ":memory:" },
			logger,
		);

		expect(services.traceEnabled).toBe(true);
		expect(services.traceRecorder).not.toBeInstanceOf(NoopTraceRecorder);
		await services.traceRecorder.close?.();
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
