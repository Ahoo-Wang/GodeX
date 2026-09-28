import { resolveDefaultSqlitePath } from "../paths";
import { asConfigObject } from "../raw";
import type { SessionConfig } from "../schema";

export function parseSessionConfig(raw: unknown): SessionConfig {
	const session = asConfigObject(raw);
	let sessionBackend: "memory" | "sqlite" = "memory";
	if (session.backend !== undefined) {
		if (session.backend !== "memory" && session.backend !== "sqlite") {
			throw new Error(`Invalid session backend: ${String(session.backend)}`);
		}
		sessionBackend = session.backend;
	}

	const sqliteConf = asConfigObject(session.sqlite);
	const sqlitePath =
		typeof sqliteConf.path === "string" && sqliteConf.path.trim() !== ""
			? sqliteConf.path.trim()
			: sessionBackend === "sqlite"
				? resolveDefaultSqlitePath()
				: undefined;

	return {
		backend: sessionBackend,
		...(sqlitePath ? { sqlite: { path: sqlitePath } } : {}),
	};
}
