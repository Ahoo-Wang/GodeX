import type { SearchRequest, SearchResponse, SearchService } from "./types";

export class NoneSearchProvider implements SearchService {
	readonly name = "none";
	readonly available = false;

	async search(_request: SearchRequest): Promise<SearchResponse> {
		throw new Error("web_search provider is not configured.");
	}
}
