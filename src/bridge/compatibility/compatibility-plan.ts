import type { CompatibilityDiagnostic } from "./diagnostic";

export interface ParameterCapabilities {
	supported: ReadonlySet<string>;
}

export interface ToolCapabilities {
	supported: ReadonlySet<string>;
	degraded?: ReadonlyMap<string, string>;
	maxTools?: number;
}

export interface ToolChoiceCapabilities {
	supported: ReadonlySet<string>;
}

export interface ResponseFormatCapabilities {
	supported: ReadonlySet<string>;
}

export interface ReasoningCapabilities {
	effort: "none" | "boolean" | "native";
}

export interface StreamingCapabilities {
	usage: boolean;
}

export interface ProviderCapabilities {
	parameters: ParameterCapabilities;
	tools: ToolCapabilities;
	toolChoice: ToolChoiceCapabilities;
	responseFormats: ResponseFormatCapabilities;
	reasoning: ReasoningCapabilities;
	streaming: StreamingCapabilities;
}

export interface CompatibilityDecision {
	action: "supported" | "degraded" | "ignored" | "rejected";
	reason?: string;
	effectiveValue?: unknown;
}

export interface CompatibilityPlan {
	capabilities: ProviderCapabilities;
	diagnostics: CompatibilityDiagnostic[];
	parameters: Record<string, CompatibilityDecision>;
	responseFormat?: CompatibilityDecision;
	reasoning?: CompatibilityDecision;
}

export function supportedPlan(
	capabilities: ProviderCapabilities,
): CompatibilityPlan {
	return {
		capabilities,
		diagnostics: [],
		parameters: {},
	};
}
