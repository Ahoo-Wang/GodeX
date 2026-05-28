import type { CompatibilityDiagnostic } from "../../adapter/compatibility";
import type { CompatibilityPlan } from "../../adapter/mapper/chat/compatibility-plan";
import { isRecord } from "../../adapter/utils";
import type { ResponsesContext } from "../../context/responses-context";

interface WarnIgnoredParameterOptions {
	ctx: ResponsesContext;
	plan: CompatibilityPlan;
	providerLabel: string;
	path: string;
	value: unknown;
	message?: string;
}

export function warnIgnoredParameter({
	ctx,
	plan,
	providerLabel,
	path,
	value,
	message,
}: WarnIgnoredParameterOptions): void {
	if (value === undefined) return;

	const diagnostic: CompatibilityDiagnostic = {
		code: "adapter.param.unsupported",
		severity: "warn",
		path,
		action: "ignored",
		message:
			message ??
			`${providerLabel} Chat Completions does not support Responses parameter '${path}'; ignored.`,
		metadata: {
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			parameter: path,
			value: summarizeCompatibilityValue(value),
		},
	};
	ctx.addDiagnostic(diagnostic);
	plan.diagnostics.push(diagnostic);
	plan.parameters[path] = { action: "ignored", reason: diagnostic.message };
}

export function summarizeCompatibilityValue(value: unknown): unknown {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		return { type: "array", length: value.length };
	}

	if (isRecord(value)) {
		const summary: Record<string, unknown> = {
			type: "object",
			keys: Object.keys(value).sort(),
		};
		if (typeof value.id === "string") {
			summary.id = value.id;
		}
		return summary;
	}

	return typeof value;
}
