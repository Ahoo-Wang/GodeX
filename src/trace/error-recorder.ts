import { GodeXError, SERVER_ERROR, toLogEntry } from "../error";
import type { TraceRecordingContext } from "./context";
import { nowTraceMillis } from "./time";

export function recordTraceError(
	ctx: TraceRecordingContext,
	eventName: string,
	err: unknown,
): void {
	if (!ctx.app.traceEnabled) return;
	const entry = toLogEntry(err);
	ctx.app.traceRecorder.record({
		kind: "error",
		request_id: ctx.requestId,
		response_id: ctx.responseId,
		provider: ctx.resolved.provider,
		model: ctx.resolved.model,
		created_at: nowTraceMillis(),
		event_name: eventName,
		error_type: errorType(err),
		domain: stringValue(entry.domain),
		code: errorCode(err, entry),
		message: errorMessage(err, entry),
		status: errorStatus(err, entry),
		payload: { payload: entry },
	});
}

function errorType(err: unknown): string {
	if (err instanceof Error) return err.name;
	return typeof err;
}

function errorCode(err: unknown, entry: Record<string, unknown>): string {
	if (err instanceof GodeXError) return err.code;
	return stringValue(entry.code) ?? SERVER_ERROR;
}

function errorMessage(err: unknown, entry: Record<string, unknown>): string {
	if (err instanceof Error) return err.message;
	return stringValue(entry.message) ?? String(err);
}

function errorStatus(
	err: unknown,
	entry: Record<string, unknown>,
): number | null {
	if (err instanceof GodeXError) return err.status;
	return typeof entry.status === "number" ? entry.status : null;
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}
