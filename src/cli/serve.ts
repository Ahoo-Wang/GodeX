import { EnvVars } from "../config";
import { ApplicationContext } from "../context/application-context";
import type { Logger } from "../logger";
import { createBuiltinRegistrar } from "../providers/builtin";
import { createBuiltinRoutes, startServer } from "../server";
import type { ResponseSessionStore } from "../session";
import { GODEX_VERSION } from "../version";
import type { CliRuntime } from ".";
import { formatStartupBanner } from "./banner";
import type { CliOptions } from "./config";
import { assertConfigReady, loadRuntimeConfig } from "./config";

export function serve(opts: CliOptions, runtime: CliRuntime): void {
	const { config, path: configPath } = loadRuntimeConfig(opts, runtime);
	const registrar = createBuiltinRegistrar();
	assertConfigReady(config, registrar);

	const app = new ApplicationContext(config, registrar);

	app.logger.info("config.loaded", {
		path: configPath,
		default_provider: config.default_provider,
		providers: Object.keys(config.providers),
		session_backend: config.session.backend,
	});

	runtime.stdout?.write(
		formatStartupBanner({
			version: GODEX_VERSION,
			env: EnvVars.current,
			host: config.server.host,
			port: config.server.port,
			configPath,
			session: config.session,
			providers: Object.keys(config.providers),
		}),
	);

	const runServer = runtime.startServer ?? startServer;
	const server = runServer({
		config,
		configPath,
		logger: app.logger,
		routes: createBuiltinRoutes(app),
	});

	registerShutdownHandlers(server, app.sessionStore, app.logger);
}

export function registerShutdownHandlers(
	server: { stop(): void } | { port: number },
	sessionStore: ResponseSessionStore,
	logger: Logger,
): void {
	const shutdown = (signal: string) => {
		logger.info("godex.shutting.down", { signal });
		if ("stop" in server && typeof server.stop === "function") {
			server.stop();
		}
		if ("close" in sessionStore && typeof sessionStore.close === "function") {
			(sessionStore as { close(): void }).close();
		}
		process.exit(0);
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}
