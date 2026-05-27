import { resolveResponseSessionChain } from "./chain";
import { assertCanSaveSession } from "./save-policy";
import { cloneStoredResponseSession } from "./snapshot-clone";
import type {
	ResolveResponseSessionOptions,
	ResponseId,
	ResponseSessionSnapshot,
	ResponseSessionStore,
	SaveResponseSessionOptions,
	StoredResponseSession,
} from "./types";

/**
 * In-memory session store for tests, demos, and single-process deployments.
 *
 * The store clones snapshots on read/write so callers cannot mutate persisted
 * state by holding object references.
 */
export class MemoryResponseSessionStore implements ResponseSessionStore {
	private readonly sessions = new Map<ResponseId, StoredResponseSession>();

	constructor(sessions: StoredResponseSession[] = []) {
		for (const session of sessions) {
			this.sessions.set(session.id, cloneStoredResponseSession(session));
		}
	}

	async get(responseId: ResponseId): Promise<StoredResponseSession | null> {
		const session = this.sessions.get(responseId);
		return session ? cloneStoredResponseSession(session) : null;
	}

	async save(
		session: StoredResponseSession,
		options?: SaveResponseSessionOptions,
	): Promise<void> {
		assertCanSaveSession({
			session,
			existing: this.sessions.get(session.id) ?? null,
			options,
		});

		this.sessions.set(session.id, cloneStoredResponseSession(session));
	}

	async resolveChain(
		previousResponseId: ResponseId,
		options?: ResolveResponseSessionOptions,
	): Promise<ResponseSessionSnapshot> {
		return resolveResponseSessionChain(previousResponseId, {
			...options,
			get: (responseId) => {
				const session = this.sessions.get(responseId);
				return session ? cloneStoredResponseSession(session) : null;
			},
		});
	}

	async delete(responseId: ResponseId): Promise<void> {
		this.sessions.delete(responseId);
	}

	clear(): void {
		this.sessions.clear();
	}
}
