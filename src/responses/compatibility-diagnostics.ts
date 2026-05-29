import type {
	CompatibilityDiagnostic,
	DiagnosticSeverity,
} from "../bridge/compatibility";
import type { ResponsesContext } from "../context/responses-context";

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

	const severity = diagnostics.reduce<DiagnosticSeverity>((max, d) => {
		const current = SEVERITY_PRIORITY[d.severity];
		const existing = SEVERITY_PRIORITY[max];
		return current > existing ? d.severity : max;
	}, "info");

	const attr = {
		request_id: ctx.requestId,
		response_id: ctx.responseId,
		count: diagnostics.length,
		diagnostics,
		...(timing ? { durationMillis: timing.durationMillis } : {}),
	};

	switch (severity) {
		case "error":
			ctx.logger.error("responses.diagnostics", () => attr);
			break;
		case "warn":
			ctx.logger.warn("responses.diagnostics", () => attr);
			break;
		default:
			ctx.logger.info("responses.diagnostics", () => attr);
			break;
	}
}

export type { CompatibilityDiagnostic };
