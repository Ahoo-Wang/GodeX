import type { Adapter } from "../adapter/adapter";
import { DefaultAdapter } from "../adapter/default-adapter";
import type { GodeXConfig } from "../config";
import { createLogger, type Logger } from "../logger";
import type { Registrar } from "../providers/registrar";
import { ModelResolver } from "../resolver";
import type { ResponseSessionStore } from "../session";
import type { TraceRecorder } from "../trace";
import { createConfiguredRegistrar } from "./provider-bootstrap";
import { createResponseSessionStore } from "./session-store-factory";
import { createTraceServices } from "./trace-services";

export interface ApplicationServices {
	logger: Logger;
	resolver: ModelResolver;
	registrar: Registrar;
	adapter: Adapter;
	sessionStore: ResponseSessionStore;
	traceRecorder: TraceRecorder;
	traceEnabled: boolean;
}

export function createApplicationServices(
	config: GodeXConfig,
	registrar?: Registrar,
): ApplicationServices {
	const logger = createLogger(config.logging);
	const resolver = new ModelResolver({
		defaultProvider: config.default_provider,
		aliases: config.models?.aliases,
	});
	const configuredRegistrar = createConfiguredRegistrar(
		config.providers,
		logger,
		registrar,
	);
	const trace = createTraceServices(config.trace, logger);

	return {
		logger,
		resolver,
		registrar: configuredRegistrar,
		adapter: new DefaultAdapter(),
		sessionStore: createResponseSessionStore(config.session),
		traceRecorder: trace.traceRecorder,
		traceEnabled: trace.traceEnabled,
	};
}
