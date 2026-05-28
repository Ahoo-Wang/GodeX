import type { ProviderCapabilities } from "../compatibility";

export interface BridgeToolProfile {
	readonly native: ReadonlySet<string>;
	readonly degraded: ReadonlyMap<string, string>;
	readonly maxTools?: number;
}

export interface BridgeToolChoiceProfile {
	readonly supported: ReadonlySet<string>;
}

export interface BridgeDialectProfile {
	readonly provider: string;
	readonly tools: BridgeToolProfile;
	readonly toolChoice: BridgeToolChoiceProfile;
}

export function bridgeDialectFromCapabilities(
	provider: string,
	capabilities: ProviderCapabilities,
): BridgeDialectProfile {
	const degraded = capabilities.tools.degraded ?? new Map<string, string>();
	const native = new Set(
		[...capabilities.tools.supported].filter((type) => !degraded.has(type)),
	);
	return {
		provider,
		tools: {
			native,
			degraded,
			maxTools: capabilities.tools.maxTools,
		},
		toolChoice: capabilities.toolChoice,
	};
}
