import type { Provider } from "../adapter/provider";
import type { ProviderConfig } from "../config";

export interface ProviderDefinition {
	readonly name: string;
	create(config: ProviderConfig): Provider<unknown, unknown, unknown>;
}

export function createProviderDefinition<TReq, TRes, TChunk>(
	name: string,
	create: (config: ProviderConfig) => Provider<TReq, TRes, TChunk>,
): ProviderDefinition {
	return {
		name,
		create: (config) => create(config) as Provider<unknown, unknown, unknown>,
	};
}
