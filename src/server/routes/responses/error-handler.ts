import type { ApplicationContext } from "../../../context/application-context";
import {
	GodeXError,
	ProviderError,
	SERVER_ERROR,
	toLogEntry,
} from "../../../error";
import { jsonError, providerErrorToHttp } from "../../errors";

export function responseRouteErrorToResponse(
	err: unknown,
	app: ApplicationContext,
	requestId?: string,
): Response {
	const { logger } = app;

	if (err instanceof ProviderError) {
		logger.error("responses.request.provider.error", () => err.toLogEntry());
		const mapped = providerErrorToHttp(err);
		return jsonError(mapped.status, mapped.error.code, mapped.error.message, {
			requestId,
		});
	}

	if (err instanceof GodeXError) {
		logger.info("responses.request.error", err.toLogEntry());
		return jsonError(err.status, err.code, err.message, {
			requestId,
		});
	}

	logger.error("godex.unexpected.error", () => ({
		...toLogEntry(err),
		request_id: requestId,
	}));
	return jsonError(500, SERVER_ERROR, "Internal server error", {
		requestId,
	});
}
