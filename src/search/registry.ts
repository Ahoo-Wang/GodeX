import type { WebSearchConfig } from "../config";
import { DEFAULT_WEB_SEARCH_CONFIG } from "../config/sections/web-search";
import { MockSearchProvider } from "./mock-provider";
import { NoneSearchProvider } from "./none-provider";
import type { SearchService } from "./types";

export function createSearchService(config?: WebSearchConfig): SearchService {
	const effective = config ?? DEFAULT_WEB_SEARCH_CONFIG;
	if (!effective.enabled || effective.provider === "none") {
		return new NoneSearchProvider();
	}
	if (effective.provider === "mock") return new MockSearchProvider();
	return new NoneSearchProvider();
}
