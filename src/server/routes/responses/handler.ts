import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
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
	let ctx: ResponsesContext | undefined;
	try {
		const { body } = parsed;
		const responseCtx = await createResponsesContext(app, body);
		ctx = responseCtx;
		requestId = responseCtx.requestId;

		responseCtx.logger.debug("responses.request.received", () =>
			responseRequestLogEntry(body, responseCtx),
		);
		return await dispatchResponseRequest(responseCtx, app);
	} catch (err) {
		return responseRouteErrorToResponse(err, app, ctx ?? requestId);
	}
}
