import type { GodeXConfig } from "../config";
import { DEFAULT_WEB_SEARCH_CONFIG } from "../config/sections/web-search";
import { ZHIPU_BASE_URL } from "../providers/zhipu";
import { MockSearchProvider } from "./mock-provider";
import { NoneSearchProvider } from "./none-provider";
import type { SearchService } from "./types";
import { ZhipuSearchProvider } from "./zhipu-provider";

export function createSearchService(config?: GodeXConfig): SearchService {
	const effective = config?.web_search ?? DEFAULT_WEB_SEARCH_CONFIG;
	if (!effective.enabled || effective.provider === "none") {
		return new NoneSearchProvider();
	}
	if (effective.provider === "mock") return new MockSearchProvider();
	if (effective.provider === "zhipu") {
		const providerConfig = config?.providers.zhipu;
		if (!providerConfig?.credentials.api_key) return new NoneSearchProvider();
		return new ZhipuSearchProvider({
			apiKey: providerConfig.credentials.api_key,
			baseURL: providerConfig.endpoint?.base_url ?? ZHIPU_BASE_URL,
			timeoutMs: providerConfig.timeout_ms,
		});
	}
	return new NoneSearchProvider();
}
