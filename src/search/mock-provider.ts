import type { SearchRequest, SearchResponse, SearchService } from "./types";

export class MockSearchProvider implements SearchService {
	readonly name = "mock";
	readonly available = true;

	async search(request: SearchRequest): Promise<SearchResponse> {
		const slug = request.query
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		return {
			query: request.query,
			results: [
				{
					title: `Mock result for ${request.query}`,
					url: `https://example.com/search/${slug || "query"}`,
					snippet: `Deterministic mock search result for ${request.query}.`,
				},
			],
		};
	}
}
