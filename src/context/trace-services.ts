import type { TraceConfig } from "../config";
import type { Logger } from "../logger";
import {
	AsyncTraceRecorder,
	ChatCompletionPromptCacheRequestAnalyzer,
	LruPromptCacheObservationIndex,
	NoopTraceRecorder,
	PrefixPromptCacheDetector,
	type PromptCacheDetector,
	type PromptCacheObservationIndex,
	type ProviderPromptCacheRequestAnalyzer,
	SQLiteTraceStore,
	type TraceRecorder,
} from "../trace";

export interface TraceServices {
	traceEnabled: boolean;
	traceRecorder: TraceRecorder;
	promptCacheRequestAnalyzer: ProviderPromptCacheRequestAnalyzer;
	promptCacheDetector: PromptCacheDetector;
	promptCacheObservationIndex: PromptCacheObservationIndex;
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
		promptCacheRequestAnalyzer: new ChatCompletionPromptCacheRequestAnalyzer(),
		promptCacheDetector: new PrefixPromptCacheDetector(),
		promptCacheObservationIndex: new LruPromptCacheObservationIndex(
			Math.max(1000, config.max_queue_size),
		),
	};
}
