import type { GodeXConfig } from "../config";
import { createLogger, type Logger } from "../logger";
import type { Registrar } from "../providers/registrar";
import { ModelResolver } from "../resolver";
import type { ResponsesBridge } from "../responses/bridge";
import { ResponsesBridgeRuntime } from "../responses/runtime";
import type { ResponseSessionStore } from "../session";
import type { TraceRecorder } from "../trace";
import { createConfiguredRegistrar } from "./provider-bootstrap";
import { createResponseSessionStore } from "./session-store-factory";
import { createTraceServices } from "./trace-services";

export interface ApplicationServices {
	logger: Logger;
	resolver: ModelResolver;
	registrar: Registrar;
	responses: ResponsesBridge;
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
		responses: new ResponsesBridgeRuntime(),
		sessionStore: createResponseSessionStore(config.session),
		traceRecorder: trace.traceRecorder,
		traceEnabled: trace.traceEnabled,
	};
}
