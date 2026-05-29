export type DiagnosticSeverity = "info" | "warn" | "error";

export interface CompatibilityDiagnostic {
	code: string;
	severity: DiagnosticSeverity;
	path?: string;
	action: "degraded" | "ignored" | "rejected";
	message: string;
	metadata?: Record<string, unknown>;
}
