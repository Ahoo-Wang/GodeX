import { describe, expect, test } from "bun:test";
import type { GodeXConfig, WebSearchConfig } from "../config";
import { createSearchService } from "./registry";

const config: WebSearchConfig = {
	enabled: true,
	mode: "auto",
	provider: "mock",
	on_unavailable: "client_tool_call",
	max_iterations: 2,
	timeout_ms: 1000,
};

describe("createSearchService", () => {
	test("creates an executable mock provider", async () => {
		const service = createSearchService({ web_search: config } as GodeXConfig);

		expect(service.available).toBe(true);
		const result = await service.search({
			query: "bun latest",
			contextSize: "medium",
			contentTypes: ["text"],
		});

		expect(result.results[0]).toMatchObject({
			url: "https://example.com/search/bun-latest",
		});
	});

	test("creates an unavailable service for provider none", async () => {
		const service = createSearchService({
			web_search: { ...config, provider: "none" },
		} as GodeXConfig);

		expect(service.available).toBe(false);
		await expect(
			service.search({
				query: "bun",
				contextSize: "medium",
				contentTypes: ["text"],
			}),
		).rejects.toThrow(/not configured/);
	});

	test("creates a Zhipu search provider from configured Zhipu credentials", () => {
		const service = createSearchService({
			web_search: { ...config, provider: "zhipu" },
			providers: {
				zhipu: {
					spec: "zhipu",
					credentials: { api_key: "zhipu-key" },
					endpoint: { base_url: "https://open.bigmodel.cn/api/paas/v4" },
				},
			},
		} as unknown as GodeXConfig);

		expect(service.name).toBe("zhipu");
		expect(service.available).toBe(true);
	});
});
