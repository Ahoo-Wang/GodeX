import { describe, expect, test } from "bun:test";
import type { WebSearchConfig } from "../config";
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
		const service = createSearchService(config);

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
		const service = createSearchService({ ...config, provider: "none" });

		expect(service.available).toBe(false);
		await expect(
			service.search({
				query: "bun",
				contextSize: "medium",
				contentTypes: ["text"],
			}),
		).rejects.toThrow(/not configured/);
	});
});
