import type { GodeXConfig } from "../config";
import type { Logger } from "../logger";
import type { Registrar } from "../providers/registrar";
import type { ModelResolver } from "../resolver";
import type { ResponsesBridge } from "../responses/bridge";
import type { ResponseSessionStore } from "../session";
import type { TraceRecorder } from "../trace";
import { createApplicationServices } from "./application-services";

export class ApplicationContext {
	readonly config: GodeXConfig;
	readonly logger: Logger;
	readonly resolver: ModelResolver;
	readonly registrar: Registrar;
	readonly responses: ResponsesBridge;
	readonly sessionStore: ResponseSessionStore;
	readonly traceRecorder: TraceRecorder;
	readonly traceEnabled: boolean;

	constructor(config: GodeXConfig, registrar?: Registrar) {
		const services = createApplicationServices(config, registrar);
		this.config = config;
		this.logger = services.logger;
		this.resolver = services.resolver;
		this.registrar = services.registrar;
		this.responses = services.responses;
		this.sessionStore = services.sessionStore;
		this.traceRecorder = services.traceRecorder;
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
