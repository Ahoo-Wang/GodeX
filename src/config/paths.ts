import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { EnvVars } from "./env";

/** Config file search paths, in priority order. */
export const CONFIG_SEARCH_PATHS = [
	"godex.yaml",
	join(homedir(), ".godex", "config.yaml"),
];

export function resolveDefaultConfigPath(): string {
	for (const candidate of CONFIG_SEARCH_PATHS) {
		if (existsSync(resolve(candidate))) return candidate;
	}
	return CONFIG_SEARCH_PATHS[0] as string;
}

export function resolveDefaultSqlitePath(): string {
	if (EnvVars.isDev) return "./data/sessions.db";
	return join(homedir(), ".godex", "data", "sessions.db");
}

export function resolveDefaultTracePath(): string {
	if (EnvVars.isDev) return "./data/trace.db";
	return join(homedir(), ".godex", "data", "trace.db");
}
