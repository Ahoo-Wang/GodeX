import { asConfigObject } from "../raw";
import type { ServerConfig } from "../schema";
import { nonNegativeInteger, validateHost, validatePort } from "../validation";

export interface ServerConfigOverrides {
	port?: number;
	host?: string;
}

export function parseServerConfig(
	raw: unknown,
	overrides: ServerConfigOverrides,
): ServerConfig {
	const server = asConfigObject(raw);
	const port =
		overrides.port !== undefined
			? validatePort(overrides.port)
			: server.port !== undefined
				? validatePort(server.port)
				: process.env.GODEX_PORT !== undefined
					? validatePort(process.env.GODEX_PORT)
					: 5678;
	const host =
		overrides.host !== undefined
			? validateHost(overrides.host)
			: server.host !== undefined
				? validateHost(server.host)
				: process.env.GODEX_HOST !== undefined
					? validateHost(process.env.GODEX_HOST)
					: "0.0.0.0";
	const idleTimeout =
		server.idle_timeout !== undefined
			? nonNegativeInteger(server.idle_timeout, "server.idle_timeout")
			: 0;

	return { port, host, idle_timeout: idleTimeout };
}
