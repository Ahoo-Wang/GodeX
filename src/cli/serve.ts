import { isDevMode } from "../config";
import { ApplicationContext } from "../context/application-context";
import type { Logger } from "../logger";
import { createBuiltinRegistrar } from "../providers/builtin";
import { createBuiltinRoutes, startServer } from "../server";
import type { ResponseSessionStore } from "../session";
import { GODEX_VERSION } from "../version";
import type { CliRuntime } from ".";
import type { CliOptions } from "./config";
import { assertConfigReady, loadRuntimeConfig } from "./config";

export function serve(opts: CliOptions, runtime: CliRuntime): void {
	const { config, path: configPath } = loadRuntimeConfig(opts, runtime);
	const registrar = createBuiltinRegistrar();
	assertConfigReady(config, registrar);

	const app = new ApplicationContext(config, registrar);

	const runServer = runtime.startServer ?? startServer;
	const server = runServer({
		config,
		configPath,
		logger: app.logger,
		routes: createBuiltinRoutes(app),
	});

	runtime.stdout?.write(
		formatStartupBanner({
			version: GODEX_VERSION,
			env: isDevMode() ? "dev" : "prod",
			host: config.server.host,
			port: server.port ?? config.server.port,
			configPath,
			session: config.session,
			defaultProvider: config.default_provider,
			providers: Object.keys(config.providers),
		}),
	);
	registerShutdownHandlers(server, app.sessionStore, app.logger);
}

function formatStartupBanner(opts: {
	version: string;
	env: string;
	host: string;
	port: number;
	configPath: string;
	session: { backend: string; sqlite?: { path: string } };
	defaultProvider: string;
	providers: string[];
}): string {
	const lines: string[] = [
		`Godex v${opts.version} [${opts.env}]`,
		``,
		`  address: http://${opts.host}:${opts.port}`,
		`  config: ${opts.configPath}`,
		`  provider: ${opts.defaultProvider} (${opts.providers.join(", ")})`,
		`  session: ${formatSessionBackend(opts.session)}`,
	];
	return `${lines.join("\n")}\n`;
}

function formatSessionBackend(session: {
	backend: string;
	sqlite?: { path: string };
}): string {
	if (session.backend === "sqlite" && session.sqlite?.path) {
		return `sqlite (${session.sqlite.path})`;
	}
	return session.backend;
}

function registerShutdownHandlers(
	server: { stop(): void } | { port: number },
	sessionStore: ResponseSessionStore,
	logger: Logger,
): void {
	const shutdown = (signal: string) => {
		logger.info("shutting_down", { signal });
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
