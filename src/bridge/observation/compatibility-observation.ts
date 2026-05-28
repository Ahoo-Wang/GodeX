export type ObservationAction =
	| "supported"
	| "ignored"
	| "degraded"
	| "rejected"
	| "provider_patch"
	| "stream_transition";

export interface ObservationDecision {
	readonly path: string;
	readonly action: ObservationAction;
	readonly reason?: string;
	readonly effectiveValue?: unknown;
}

export interface CompatibilityObservation {
	readonly requestId: string;
	readonly responseId: string;
	readonly provider: string;
	readonly model: string;
	readonly decisions: readonly ObservationDecision[];
	readonly toolPlan?: unknown;
	readonly outputContract?: unknown;
	readonly streamState?: unknown;
}

export function createCompatibilityObservation(
	observation: CompatibilityObservation,
): CompatibilityObservation {
	return observation;
}
