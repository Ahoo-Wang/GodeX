import type { ResponseCreateRequest } from "../../protocol/openai/responses";
import {
	type CompatibilityDecision,
	type CompatibilityPlan,
	type ProviderCapabilities,
	supportedPlan,
} from "./compatibility-plan";
import type { CompatibilityDiagnostic } from "./diagnostic";

export type { ProviderCapabilities };

export interface PlanBridgeCompatibilityInput {
	readonly provider: string;
	readonly model: string;
	readonly request: ResponseCreateRequest;
	readonly capabilities: ProviderCapabilities;
}

const GODEX_OWNED_PARAMETERS = [
	"metadata",
	"conversation",
	"background",
] as const;

export function planBridgeCompatibility(
	input: PlanBridgeCompatibilityInput,
): CompatibilityPlan {
	const plan = supportedPlan(input.capabilities);

	for (const path of GODEX_OWNED_PARAMETERS) {
		planGodexOwnedParameter(input, plan, path);
	}
	planResponseFormat(input, plan);

	return plan;
}

function planGodexOwnedParameter(
	input: PlanBridgeCompatibilityInput,
	plan: CompatibilityPlan,
	path: (typeof GODEX_OWNED_PARAMETERS)[number],
): void {
	if (!shouldIgnoreGodexOwnedParameter(input.request, path)) return;

	const reason = `${path} is owned by GodeX and is not forwarded upstream.`;
	recordParameterDecision(input, plan, {
		path,
		action: "ignored",
		severity: "warn",
		reason,
	});
}

function shouldIgnoreGodexOwnedParameter(
	request: ResponseCreateRequest,
	path: (typeof GODEX_OWNED_PARAMETERS)[number],
): boolean {
	const value = request[path];
	if (path === "background") return value === true;
	return value !== undefined;
}

function planResponseFormat(
	input: PlanBridgeCompatibilityInput,
	plan: CompatibilityPlan,
): void {
	const requestedType = input.request.text?.format?.type;
	if (!requestedType) return;
	if (plan.capabilities.responseFormats.supported.has(requestedType)) {
		plan.responseFormat = { action: "supported" };
		return;
	}

	if (
		requestedType !== "json_schema" ||
		!plan.capabilities.responseFormats.supported.has("json_object")
	) {
		recordUnsupportedResponseFormat(input, plan, requestedType);
		return;
	}

	const effectiveValue = { type: "json_object" };
	const reason = `json_schema is degraded to json_object for provider ${input.provider}.`;
	const decision = recordParameterDecision(input, plan, {
		path: "text.format",
		action: "degraded",
		severity: "warn",
		reason,
		effectiveValue,
		metadata: { effectiveValue },
	});
	plan.responseFormat = decision;
}

function recordUnsupportedResponseFormat(
	input: PlanBridgeCompatibilityInput,
	plan: CompatibilityPlan,
	requestedType: string,
): void {
	const reason = `text.format ${requestedType} is not supported by provider ${input.provider}.`;
	const decision = recordParameterDecision(input, plan, {
		path: "text.format",
		action: "rejected",
		severity: "error",
		reason,
		metadata: { value: requestedType },
	});
	plan.responseFormat = decision;
}

function recordParameterDecision(
	input: PlanBridgeCompatibilityInput,
	plan: CompatibilityPlan,
	options: {
		readonly path: string;
		readonly action: CompatibilityDiagnostic["action"];
		readonly severity: CompatibilityDiagnostic["severity"];
		readonly reason: string;
		readonly effectiveValue?: unknown;
		readonly metadata?: Record<string, unknown>;
	},
): CompatibilityDecision {
	const diagnostic: CompatibilityDiagnostic = {
		code: parameterDiagnosticCode(options.action),
		severity: options.severity,
		path: options.path,
		action: options.action,
		message: options.reason,
		...(options.metadata
			? {
					metadata: {
						provider: input.provider,
						model: input.model,
						parameter: options.path,
						...options.metadata,
					},
				}
			: {}),
	};
	const decision: CompatibilityDecision = {
		action: options.action,
		reason: options.reason,
		...(options.effectiveValue === undefined
			? {}
			: { effectiveValue: options.effectiveValue }),
	};
	plan.diagnostics.push(diagnostic);
	plan.parameters[options.path] = decision;
	return decision;
}

function parameterDiagnosticCode(
	action: CompatibilityDiagnostic["action"],
): string {
	switch (action) {
		case "ignored":
			return "bridge.param.ignored";
		case "degraded":
			return "bridge.param.degraded";
		case "rejected":
			return "bridge.param.unsupported";
	}
}
