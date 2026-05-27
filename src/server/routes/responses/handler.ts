import type { ApplicationContext } from "../../../context/application-context";
import { createResponsesContext } from "../../../context/responses-context-factory";
import { responseRouteErrorToResponse } from "./error-handler";
import { responseRequestLogEntry } from "./request-log";
import { parseResponseRequest } from "./request-parser";
import { dispatchResponseRequest } from "./response-dispatcher";

export async function handleResponses(
	req: Request,
	app: ApplicationContext,
): Promise<Response> {
	const { logger } = app;

	const parsed = await parseResponseRequest(req, logger);
	if (!parsed.ok) return parsed.response;

	let requestId: string | undefined;
	try {
		const { body } = parsed;
		const ctx = await createResponsesContext(app, body);
		requestId = ctx.requestId;

		ctx.logger.debug("responses.request.received", () =>
			responseRequestLogEntry(body, ctx),
		);
		return await dispatchResponseRequest(ctx, app);
	} catch (err) {
		return responseRouteErrorToResponse(err, app, requestId);
	}
}
