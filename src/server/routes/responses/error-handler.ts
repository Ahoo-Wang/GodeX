import type { ApplicationContext } from "../../../context/application-context";
import {
	GodeXError,
	ProviderError,
	SERVER_ERROR,
	toLogEntry,
} from "../../../error";
import type { TraceRecordingContext } from "../../../trace";
import { recordTraceError } from "../../../trace";
import { jsonError, providerErrorToHttp } from "../../errors";

export function responseRouteErrorToResponse(
	err: unknown,
	app: ApplicationContext,
	traceContext?: TraceRecordingContext | string,
): Response {
	const { logger } = app;
	const requestId =
		typeof traceContext === "string" ? traceContext : traceContext?.requestId;

	if (err instanceof ProviderError) {
		logger.error("responses.request.provider.error", () => err.toLogEntry());
		recordRouteTraceError(
			traceContext,
			"responses.request.provider.error",
			err,
		);
		const mapped = providerErrorToHttp(err);
		return jsonError(mapped.status, mapped.error.code, mapped.error.message, {
			requestId,
		});
	}

	if (err instanceof GodeXError) {
		logger.info("responses.request.error", err.toLogEntry());
		recordRouteTraceError(traceContext, "responses.request.error", err);
		return jsonError(err.status, err.code, err.message, {
			requestId,
		});
	}

	logger.error("godex.unexpected.error", () => ({
		...toLogEntry(err),
		request_id: requestId,
	}));
	recordRouteTraceError(traceContext, "godex.unexpected.error", err);
	return jsonError(500, SERVER_ERROR, "Internal server error", {
		requestId,
	});
}

function recordRouteTraceError(
	traceContext: TraceRecordingContext | string | undefined,
	eventName: string,
	err: unknown,
): void {
	if (!traceContext || typeof traceContext === "string") return;
	recordTraceError(traceContext, eventName, err);
}
