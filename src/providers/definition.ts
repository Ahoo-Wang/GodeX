import type {
	ProviderEdge,
	ProviderRuntimeConfig,
} from "../bridge/provider-spec";

export interface ProviderDefinition {
	readonly name: string;
	create(
		config: ProviderRuntimeConfig,
	): ProviderEdge<unknown, unknown, unknown>;
}

export function createProviderDefinition<TReq, TRes, TChunk>(
	name: string,
	create: (config: ProviderRuntimeConfig) => ProviderEdge<TReq, TRes, TChunk>,
): ProviderDefinition {
	return {
		name,
		create: (config) =>
			create(config) as ProviderEdge<unknown, unknown, unknown>,
	};
}
