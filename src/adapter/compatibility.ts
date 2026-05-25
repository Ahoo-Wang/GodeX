import type { ResponsesContext } from "../context/responses-context";

export type DiagnosticSeverity = "info" | "warn" | "error";

export interface CompatibilityDiagnostic {
	code: string;
	severity: DiagnosticSeverity;
	path?: string;
	action: "degraded" | "ignored" | "rejected";
	message: string;
	metadata?: Record<string, unknown>;
}

const SEVERITY_PRIORITY: Record<DiagnosticSeverity, number> = {
	info: 0,
	warn: 1,
	error: 2,
};

export function logDiagnostics(
	ctx: ResponsesContext,
	timing?: { durationMillis: number },
): void {
	const diagnostics = [...ctx.diagnostics];
	if (diagnostics.length === 0) return;

	const severity = diagnostics.reduce((max, d) => {
		const current = SEVERITY_PRIORITY[d.severity];
		const existing = SEVERITY_PRIORITY[max];
		return current > existing ? d.severity : max;
	}, "info" as DiagnosticSeverity);

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
