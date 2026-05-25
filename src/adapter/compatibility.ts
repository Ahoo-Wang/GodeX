import type { LogLevel } from "../config/schema";
import type { ResponsesContext } from "../context/responses-context";

export interface CompatibilityDiagnostic {
	code: string;
	severity: LogLevel;
	path?: string;
	action: "degraded" | "ignored" | "rejected";
	message: string;
	metadata?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
};

export function logDiagnostics(
	ctx: ResponsesContext,
	timing?: { durationMillis: number },
): void {
	const diagnostics = ctx.diagnostics;
	if (diagnostics.length === 0) return;

	const severity = diagnostics.reduce((max, d) => {
		const current = LOG_LEVEL_PRIORITY[d.severity] ?? 0;
		const existing = LOG_LEVEL_PRIORITY[max] ?? 0;
		return current > existing ? d.severity : max;
	}, "info" as LogLevel);

	const logger = ctx.logger;
	const attr = {
		request_id: ctx.requestId,
		response_id: ctx.responseId,
		count: diagnostics.length,
		diagnostics,
		...(timing ? { durationMillis: timing.durationMillis } : {}),
	};

	switch (severity) {
		case "error":
			logger.error("responses.diagnostics", () => attr);
			break;
		case "warn":
			logger.warn("responses.diagnostics", () => attr);
			break;
		default:
			logger.info("responses.diagnostics", () => attr);
			break;
	}
}
