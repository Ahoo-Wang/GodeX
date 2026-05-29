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

export function createProviderDefinition<
	TBridgeRequest,
	TRes,
	TChunk,
	TProviderRequest = TBridgeRequest,
>(
	name: string,
	create: (
		config: ProviderRuntimeConfig,
	) => ProviderEdge<TBridgeRequest, TRes, TChunk, TProviderRequest>,
): ProviderDefinition {
	return {
		name,
		create: (config) =>
			create(config) as ProviderEdge<unknown, unknown, unknown>,
	};
}
