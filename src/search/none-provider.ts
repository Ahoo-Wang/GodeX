import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../error";
import type { SearchRequest, SearchResponse, SearchService } from "./types";

export class NoneSearchProvider implements SearchService {
	readonly name = "none";
	readonly available = false;

	async search(_request: SearchRequest): Promise<SearchResponse> {
		throw new ProviderError(
			PROVIDER_UPSTREAM_ERROR,
			"web_search provider is not configured.",
			{
				provider: this.name,
				model: "web_search",
				upstreamStatus: 503,
			},
		);
	}
}
