import type { GodeXConfig } from "../config";
import { EnvVars } from "../config";
import type { ApplicationContext } from "../context/application-context";
import type { Logger } from "../logger";
import { GODEX_VERSION } from "../version";
import { jsonError } from "./errors";
import { handleHealth } from "./routes/health";
import { handleModels } from "./routes/models";
import { handleResponses } from "./routes/responses";

export type RouteHandler = (req: Request) => Response | Promise<Response>;
export type RouteMap = Record<string, RouteHandler>;

export interface ServerDeps {
	config: GodeXConfig;
	configPath: string;
	logger: Logger;
	routes: RouteMap;
}

export function createBuiltinRoutes(app: ApplicationContext): RouteMap {
	return {
		"/health": () => handleHealth(app),
		"/v1/models": () => handleModels(app),
		"/v1/responses": (req) => handleResponses(req, app),
	};
}

export function startServer(deps: ServerDeps): ReturnType<typeof Bun.serve> {
	const { config, logger } = deps;

	const server = Bun.serve({
		hostname: config.server.host,
		port: config.server.port,
		idleTimeout: config.server.idle_timeout ?? 0,
		routes: deps.routes,
		fetch() {
			return jsonError(404, "not_found", "Not found");
		},
	});

	logger.info("godex.started", {
		version: GODEX_VERSION,
		server: config.server,
		env: EnvVars.current,
		config: { path: deps.configPath },
		session: config.session,
		logging: config.logging,
	});
	return server;
}
