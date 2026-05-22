import { SESSION_CONFLICT, SessionError } from "../error";
import { resolveResponseSessionChain } from "./chain";
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
			this.sessions.set(session.id, cloneSession(session));
		}
	}

	async get(responseId: ResponseId): Promise<StoredResponseSession | null> {
		const session = this.sessions.get(responseId);
		return session ? cloneSession(session) : null;
	}

	async save(
		session: StoredResponseSession,
		options?: SaveResponseSessionOptions,
	): Promise<void> {
		const previousResponseId = session.previous_response_id ?? null;

		if (
			options?.expected_previous_response_id !== undefined &&
			options.expected_previous_response_id !== previousResponseId
		) {
			throw new SessionError(
				SESSION_CONFLICT,
				"Response session parent did not match expected previous response ID.",
				{
					responseId: session.id,
					previousResponseId: previousResponseId ?? undefined,
				},
			);
		}

		if (this.sessions.has(session.id) && !options?.overwrite) {
			throw new SessionError(
				SESSION_CONFLICT,
				"Response session already exists.",
				{
					responseId: session.id,
					previousResponseId: previousResponseId ?? undefined,
				},
			);
		}

		this.sessions.set(session.id, cloneSession(session));
	}

	async resolveChain(
		previousResponseId: ResponseId,
		options?: ResolveResponseSessionOptions,
	): Promise<ResponseSessionSnapshot> {
		return resolveResponseSessionChain(previousResponseId, {
			...options,
			get: (responseId) => {
				const session = this.sessions.get(responseId);
				return session ? cloneSession(session) : null;
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

function cloneSession(session: StoredResponseSession): StoredResponseSession {
	return structuredClone(session);
}
