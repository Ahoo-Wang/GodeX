import {
	type CompatibilityDecision as BridgeCompatibilityDecision,
	type CompatibilityPlan as BridgeCompatibilityPlan,
	type ParameterCapabilities as BridgeParameterCapabilities,
	type ProviderCapabilities as BridgeProviderCapabilities,
	type ReasoningCapabilities as BridgeReasoningCapabilities,
	type ResponseFormatCapabilities as BridgeResponseFormatCapabilities,
	type StreamingCapabilities as BridgeStreamingCapabilities,
	type ToolCapabilities as BridgeToolCapabilities,
	type ToolChoiceCapabilities as BridgeToolChoiceCapabilities,
	supportedPlan as bridgeSupportedPlan,
} from "../../../bridge/compatibility/compatibility-plan";

export type ParameterCapabilities = BridgeParameterCapabilities;
export type ToolCapabilities = BridgeToolCapabilities;
export type ToolChoiceCapabilities = BridgeToolChoiceCapabilities;
export type ResponseFormatCapabilities = BridgeResponseFormatCapabilities;
export type ReasoningCapabilities = BridgeReasoningCapabilities;
export type StreamingCapabilities = BridgeStreamingCapabilities;
export type ProviderCapabilities = BridgeProviderCapabilities;
export type CompatibilityDecision = BridgeCompatibilityDecision;
export type CompatibilityPlan = BridgeCompatibilityPlan;

export const supportedPlan = bridgeSupportedPlan;
