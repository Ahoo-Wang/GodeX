import type { Adapter } from "../adapter/adapter";
import type { GodeXConfig } from "../config";
import type { Logger } from "../logger";
import type { Registrar } from "../providers/registrar";
import type { ModelResolver } from "../resolver";
import type { ResponseSessionStore } from "../session";
import type {
	PromptCacheDetector,
	PromptCacheObservationIndex,
	ProviderPromptCacheRequestAnalyzer,
	TraceRecorder,
} from "../trace";
import { createApplicationServices } from "./application-services";

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
		const services = createApplicationServices(config, registrar);
		this.config = config;
		this.logger = services.logger;
		this.resolver = services.resolver;
		this.registrar = services.registrar;
		this.adapter = services.adapter;
		this.sessionStore = services.sessionStore;
		this.traceRecorder = services.traceRecorder;
		this.promptCacheRequestAnalyzer = services.promptCacheRequestAnalyzer;
		this.promptCacheDetector = services.promptCacheDetector;
		this.promptCacheObservationIndex = services.promptCacheObservationIndex;
		this.traceEnabled = services.traceEnabled;
	}

	async close(): Promise<void> {
		try {
			await this.traceRecorder.close?.();
		} catch (err) {
			this.logger.warn("trace.close.error", () => ({ error: String(err) }));
		}
		this.sessionStore.close?.();
	}
}
