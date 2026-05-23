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

	constructor(config: GodeXConfig, registrar?: Registrar) {
		this.config = config;
		this.logger = createLogger(config.logging);
		this.resolver = new ModelResolver(
			config.default_provider,
			config.providers,
		);
		this.registrar = registrar ?? createBuiltinRegistrar();
		this.registrar.registerProviders(config.providers, this.logger);
		this.adapter = new DefaultAdapter();
		this.sessionStore = createSessionStore(config);
	}
}
