import { describe, expect, test } from "bun:test";
import { xiaomiPatchRequest, xiaomiWebSearchCalls } from "./hooks";
import { createXiaomiProvider } from "./index";
import { DEFAULT_XIAOMI_BASE_URL, XIAOMI_PROVIDER_NAME } from "./spec";

const config = {
	spec: "xiaomi",
	credentials: { api_key: "test-key" },
	endpoint: { base_url: "https://example.test" },
};

describe("Xiaomi provider", () => {
	test("uses the Xiaomi provider name and default base URL constant", () => {
		expect(XIAOMI_PROVIDER_NAME).toBe("xiaomi");
		expect(DEFAULT_XIAOMI_BASE_URL).toBe("https://api.xiaomimimo.com/v1");
	});

	test("factory composes a plain provider contract", () => {
		const provider = createXiaomiProvider(config);

		expect(provider.name).toBe("xiaomi");
		expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
		expect(provider.spec.name).toBe(XIAOMI_PROVIDER_NAME);
		expect(provider.request).toBeFunction();
		expect(provider.stream).toBeFunction();
	});

	test("factory creates a configured Xiaomi provider", () => {
		const provider = createXiaomiProvider({
			...config,
			endpoint: undefined,
		});

		expect(provider.name).toBe(XIAOMI_PROVIDER_NAME);
		expect(provider.spec.endpoint.defaultBaseURL).toBe(DEFAULT_XIAOMI_BASE_URL);
		expect(provider.request).toBeFunction();
	});

	test("patches generic web_search declarations to Xiaomi native tool shape", () => {
		const request = xiaomiPatchRequest({
			model: "mimo-v2.5-pro",
			messages: [{ role: "user", content: "Search current news" }],
			tools: [
				{
					type: "web_search",
					web_search: {
						enable: true,
						content_size: "high",
						user_location: {
							type: "approximate",
							country: "China",
							region: "Hubei",
							city: "Wuhan",
						},
					},
				} as never,
			],
		});

		expect(request.tools?.[0]).toEqual({
			type: "web_search",
			max_keyword: 3,
			limit: 5,
			user_location: {
				type: "approximate",
				country: "China",
				region: "Hubei",
				city: "Wuhan",
			},
		});
	});

	test("maps Xiaomi web search annotations to Responses web_search_call", () => {
		const calls = xiaomiWebSearchCalls({
			id: "chatcmpl_xiaomi",
			created: 1780246400,
			model: "mimo-v2.5-pro",
			choices: [
				{
					index: 0,
					finish_reason: "stop",
					message: {
						role: "assistant",
						content: "Search-backed answer",
						annotations: [
							{
								type: "url_citation",
								url: "https://news.example.com/a",
								title: "News A",
								summary: "News A summary",
								site_name: "Example News",
								publish_time: "2026-05-30T12:00:00+08:00",
							},
						],
					},
				},
			],
		});

		expect(calls).toEqual([
			{
				id: "ws_chatcmpl_xiaomi_0",
				type: "web_search_call",
				status: "completed",
				action: {
					type: "search",
					query: "",
					queries: [],
					sources: [{ type: "url", url: "https://news.example.com/a" }],
				},
			},
		]);
	});
});
