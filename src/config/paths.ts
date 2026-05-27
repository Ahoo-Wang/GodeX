import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { EnvVars } from "./env";

/** Config file search paths, in priority order. */
export const CONFIG_SEARCH_PATHS = Object.freeze([
	"godex.yaml",
	join(homedir(), ".godex", "config.yaml"),
] as const);

export function resolveDefaultConfigPath(
	searchPaths: readonly string[] = CONFIG_SEARCH_PATHS,
): string {
	for (const candidate of searchPaths) {
		if (existsSync(resolve(candidate))) return candidate;
	}
	return searchPaths[0] ?? CONFIG_SEARCH_PATHS[0];
}

export function resolveDefaultSqlitePath(): string {
	if (EnvVars.isDev) return "./data/sessions.db";
	return join(homedir(), ".godex", "data", "sessions.db");
}

export function resolveDefaultTracePath(): string {
	if (EnvVars.isDev) return "./data/trace.db";
	return join(homedir(), ".godex", "data", "trace.db");
}
