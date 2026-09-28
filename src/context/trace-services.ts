import type { TraceConfig } from "../config";
import type { Logger } from "../logger";
import {
	AsyncTraceRecorder,
	NoopTraceRecorder,
	SQLiteTraceStore,
	type TraceRecorder,
} from "../trace";

export interface TraceServices {
	traceEnabled: boolean;
	traceRecorder: TraceRecorder;
}

export function createTraceServices(
	config: TraceConfig,
	logger: Logger,
): TraceServices {
	const traceEnabled = config.enabled;
	return {
		traceEnabled,
		traceRecorder: traceEnabled
			? new AsyncTraceRecorder({
					store: new SQLiteTraceStore(config.path),
					logger,
					maxQueueSize: config.max_queue_size,
					flushIntervalMs: config.flush_interval_ms,
					batchSize: config.batch_size,
					capturePayload: config.capture_payload,
					payloadMaxBytes: config.payload_max_bytes,
				})
			: new NoopTraceRecorder(),
	};
}
