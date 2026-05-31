import { describe, expect, test } from "bun:test";
import { ZhipuSearchProvider } from "./zhipu-provider";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function withFetch<T>(
	fetchImpl: typeof fetch,
	run: () => Promise<T>,
): Promise<T> {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = fetchImpl;
	try {
		return await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

describe("ZhipuSearchProvider", () => {
	test("posts to the Zhipu web_search API and maps results", async () => {
		const requests: Array<{ url: string; init: RequestInit }> = [];

		await withFetch(
			(async (
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				requests.push({ url: String(input), init: init ?? {} });
				return jsonResponse({
					id: "search_1",
					created: 1780246400,
					request_id: "req_search",
					search_result: [
						{
							title: "Bun release notes",
							content: "Bun latest release summary.",
							link: "https://bun.sh/blog/latest",
							media: "Bun",
							publish_date: "2026-05-30",
						},
					],
				});
			}) as unknown as typeof fetch,
			async () => {
				const provider = new ZhipuSearchProvider({
					apiKey: "zhipu-key",
					baseURL: "https://open.bigmodel.cn/api/paas/v4",
					timeoutMs: 1000,
				});

				const result = await provider.search({
					query: "Bun latest release",
					allowedDomains: ["bun.sh"],
					contextSize: "high",
					contentTypes: ["text"],
				});

				expect(result).toEqual({
					query: "Bun latest release",
					results: [
						{
							title: "Bun release notes",
							url: "https://bun.sh/blog/latest",
							snippet: "Bun latest release summary.",
							publishedAt: "2026-05-30",
						},
					],
				});
			},
		);

		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe(
			"https://open.bigmodel.cn/api/paas/v4/web_search",
		);
		expect(requests[0]?.init.headers).toMatchObject({
			Authorization: "Bearer zhipu-key",
			"Content-Type": "application/json",
		});
		expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({
			search_query: "Bun latest release",
			search_engine: "search_std",
			search_intent: false,
			count: 10,
			search_domain_filter: "bun.sh",
			content_size: "high",
		});
	});
});
