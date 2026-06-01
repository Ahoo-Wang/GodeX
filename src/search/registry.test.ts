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

	test("keeps a configured Zhipu coding-plan base URL for web search", async () => {
		const requests: string[] = [];
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (
			input: Parameters<typeof fetch>[0],
			_init?: Parameters<typeof fetch>[1],
		) => {
			requests.push(String(input));
			return new Response(JSON.stringify({ search_result: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;
		try {
			const service = createSearchService({
				web_search: { ...config, provider: "zhipu" },
				providers: {
					zhipu: {
						spec: "zhipu",
						credentials: { api_key: "zhipu-key" },
						endpoint: {
							base_url: "https://open.bigmodel.cn/api/coding/paas/v4",
						},
					},
				},
			} as unknown as GodeXConfig);

			await service.search({
				query: "Bun latest",
				contextSize: "medium",
				contentTypes: ["text"],
			});
		} finally {
			globalThis.fetch = originalFetch;
		}

		expect(requests).toEqual([
			"https://open.bigmodel.cn/api/coding/paas/v4/web_search",
		]);
	});
});
