import type {
	Provider,
	ProviderClient,
	ProviderMapper,
} from "../adapter/provider";

export interface ProviderBundleParts<TReq, TRes, TChunk> {
	readonly name: string;
	readonly mapper: ProviderMapper<TReq, TRes, TChunk>;
	readonly client: ProviderClient<TReq, TRes, TChunk>;
}

export function createProviderBundle<TReq, TRes, TChunk>(
	parts: ProviderBundleParts<TReq, TRes, TChunk>,
): Provider<TReq, TRes, TChunk> {
	return {
		name: parts.name,
		mapper: parts.mapper,
		client: parts.client,
	};
}
