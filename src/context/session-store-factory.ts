import type { SessionConfig } from "../config";
import { resolveDefaultSqlitePath } from "../config";
import type { ResponseSessionStore } from "../session";
import { MemoryResponseSessionStore } from "../session/memory";
import { SQLiteResponseSessionStore } from "../session/sqlite";

export function createResponseSessionStore(
	config: SessionConfig,
): ResponseSessionStore {
	if (config.backend === "sqlite") {
		return new SQLiteResponseSessionStore(
			config.sqlite?.path ?? resolveDefaultSqlitePath(),
		);
	}
	return new MemoryResponseSessionStore();
}
