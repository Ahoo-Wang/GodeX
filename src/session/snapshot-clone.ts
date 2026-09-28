import type { StoredResponseSession } from "./types";

export function cloneStoredResponseSession(
	session: StoredResponseSession,
): StoredResponseSession {
	return structuredClone(session);
}
