export interface SearchProvider {
	readonly name: string;
	search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
}

export interface SearchRequest {
	readonly query: string;
	readonly queries?: readonly string[];
	readonly allowedDomains?: readonly string[];
	readonly contextSize: "low" | "medium" | "high";
	readonly contentTypes: readonly ("text" | "image")[];
	readonly userLocation?: unknown;
}

export interface SearchResult {
	readonly title?: string;
	readonly url: string;
	readonly snippet?: string;
	readonly publishedAt?: string;
}

export interface SearchResponse {
	readonly query: string;
	readonly results: readonly SearchResult[];
}

export interface SearchService extends SearchProvider {
	readonly available: boolean;
}
