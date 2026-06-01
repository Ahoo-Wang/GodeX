import { describe, expect, test } from "bun:test";
import { zhipuWebSearchCalls } from "./hooks";
import type { ChatCompletionResponse } from "./protocol";

describe("zhipuWebSearchCalls", () => {
	test("maps native web_search results to a completed Responses web_search_call", () => {
		const calls = zhipuWebSearchCalls({
			id: "chatcmpl_123",
			created: 1710000000,
			model: "glm-test",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: "Answer." },
					finish_reason: "stop",
				},
			],
			web_search: [
				{
					title: "Latest Bun release",
					link: "https://example.com/bun",
					content: "Bun release information.",
				},
				{
					title: "Ignored missing link",
					content: "No URL.",
				},
			],
		} satisfies ChatCompletionResponse);

		expect(calls).toEqual([
			{
				id: "ws_chatcmpl_123_0",
				type: "web_search_call",
				status: "completed",
				action: {
					type: "search",
					query: "web search",
					queries: ["web search"],
					sources: [{ type: "url", url: "https://example.com/bun" }],
				},
			},
		]);
	});
});
