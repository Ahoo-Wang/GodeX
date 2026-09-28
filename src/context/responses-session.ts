import type { Logger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../session";
import type { ApplicationContext } from "./application-context";

export async function resolveResponsesSession(
	app: ApplicationContext,
	request: ResponseCreateRequest,
	logger: Logger,
): Promise<ResponseSessionSnapshot | null> {
	const previousResponseId = request.previous_response_id;
	if (!previousResponseId) return null;

	const session = await app.sessionStore.resolveChain(previousResponseId);
	logger.debug("session.chain.resolved", () => ({
		previous_response_id: previousResponseId,
		turnCount: session.turns.length,
	}));
	return session;
}
