import { SESSION_CONFLICT, SessionError } from "../error";
import type {
	SaveResponseSessionOptions,
	StoredResponseSession,
} from "./types";

export interface SaveSessionPolicyInput {
	session: StoredResponseSession;
	existing: StoredResponseSession | null;
	options?: SaveResponseSessionOptions;
}

export function assertCanSaveSession(input: SaveSessionPolicyInput): void {
	const previousResponseId = input.session.previous_response_id ?? null;

	if (
		input.options?.expected_previous_response_id !== undefined &&
		input.options.expected_previous_response_id !== previousResponseId
	) {
		throw new SessionError(
			SESSION_CONFLICT,
			"Response session parent did not match expected previous response ID.",
			{
				responseId: input.session.id,
				previousResponseId: previousResponseId ?? undefined,
			},
		);
	}

	if (input.existing && !input.options?.overwrite) {
		throw new SessionError(
			SESSION_CONFLICT,
			"Response session already exists.",
			{
				responseId: input.session.id,
				previousResponseId: previousResponseId ?? undefined,
			},
		);
	}
}
