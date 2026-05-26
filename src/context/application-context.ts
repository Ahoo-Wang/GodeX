import type { Adapter } from "../adapter/adapter";
import { DefaultAdapter } from "../adapter/default-adapter";
import type { GodeXConfig } from "../config";
import { resolveDefaultSqlitePath } from "../config";
import { createLogger, type Logger } from "../logger";
import { createBuiltinRegistrar } from "../providers/builtin";
import type { Registrar } from "../providers/registrar";
import { ModelResolver } from "../resolver";
import type { ResponseSessionStore } from "../session";
import { MemoryResponseSessionStore } from "../session/memory";
import { SQLiteResponseSessionStore } from "../session/sqlite";
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

function createSessionStore(config: {
	session: { backend: string; sqlite?: { path: string } };
}): ResponseSessionStore {
	return config.session.backend === "sqlite"
		? new SQLiteResponseSessionStore(
				config.session.sqlite?.path ?? resolveDefaultSqlitePath(),
			)
		: new MemoryResponseSessionStore();
}

export class ApplicationContext {
	readonly config: GodeXConfig;
	readonly logger: Logger;
	readonly resolver: ModelResolver;
	readonly registrar: Registrar;
	readonly adapter: Adapter;
	readonly sessionStore: ResponseSessionStore;
	readonly traceRecorder: TraceRecorder;
	readonly promptCacheRequestAnalyzer: ProviderPromptCacheRequestAnalyzer;
	readonly promptCacheDetector: PromptCacheDetector;
	readonly promptCacheObservationIndex: PromptCacheObservationIndex;
	readonly traceEnabled: boolean;

	constructor(config: GodeXConfig, registrar?: Registrar) {
		this.config = config;
		this.logger = createLogger(config.logging);
		this.resolver = new ModelResolver(
			config.default_provider,
			config.models?.aliases,
		);
		this.registrar = registrar ?? createBuiltinRegistrar();
		this.registrar.registerProviders(config.providers, this.logger);
		this.adapter = new DefaultAdapter();
		this.sessionStore = createSessionStore(config);
		this.traceEnabled = config.trace.enabled;
		this.promptCacheRequestAnalyzer =
			new ChatCompletionPromptCacheRequestAnalyzer();
		this.promptCacheDetector = new PrefixPromptCacheDetector();
		this.promptCacheObservationIndex = new LruPromptCacheObservationIndex(
			Math.max(1000, config.trace.max_queue_size),
		);
		this.traceRecorder = config.trace.enabled
			? new AsyncTraceRecorder({
					store: new SQLiteTraceStore(config.trace.path),
					logger: this.logger,
					maxQueueSize: config.trace.max_queue_size,
					flushIntervalMs: config.trace.flush_interval_ms,
					batchSize: config.trace.batch_size,
					capturePayload: config.trace.capture_payload,
					payloadMaxBytes: config.trace.payload_max_bytes,
				})
			: new NoopTraceRecorder();
	}

	async close(): Promise<void> {
		try {
			await this.traceRecorder.close?.();
		} catch (err) {
			this.logger.warn("trace.close.error", () => ({ error: String(err) }));
		}
		if (
			"close" in this.sessionStore &&
			typeof this.sessionStore.close === "function"
		) {
			this.sessionStore.close();
		}
	}
}
