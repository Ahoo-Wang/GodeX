import { describe, expect, test } from "bun:test";
import { ChatCompletionPromptCacheRequestAnalyzer } from "./prompt-cache-analyzer";

describe("ChatCompletionPromptCacheRequestAnalyzer", () => {
	test("extracts requested and provider-side cache fields", () => {
		const analyzer = new ChatCompletionPromptCacheRequestAnalyzer();
		const analysis = analyzer.analyze({
			provider: "openai",
			model: "gpt-test",
			request: {
				model: "gpt-test",
				prompt_cache_key: "requested",
				prompt_cache_retention: "24h",
			},
			providerRequest: {
				model: "gpt-test",
				messages: [],
				prompt_cache_key: "requested",
				prompt_cache_retention: "24h",
			},
		});
		expect(analysis.requested_prompt_cache_key).toBe("requested");
		expect(analysis.prompt_cache_key).toBe("requested");
		expect(analysis.requested_prompt_cache_retention).toBe("24h");
		expect(analysis.prompt_cache_retention).toBe("24h");
	});

	test("preserves message and tool order in hashes", () => {
		const analyzer = new ChatCompletionPromptCacheRequestAnalyzer();
		const a = analyzer.analyze({
			provider: "openai",
			model: "gpt-test",
			request: { model: "gpt-test" },
			providerRequest: {
				model: "gpt-test",
				messages: [
					{ role: "system", content: "A" },
					{ role: "user", content: "B" },
				],
				tools: [
					{ type: "function", function: { name: "first" } },
					{ type: "function", function: { name: "second" } },
				],
			},
		});
		const b = analyzer.analyze({
			provider: "openai",
			model: "gpt-test",
			request: { model: "gpt-test" },
			providerRequest: {
				model: "gpt-test",
				messages: [
					{ role: "user", content: "B" },
					{ role: "system", content: "A" },
				],
				tools: [
					{ type: "function", function: { name: "second" } },
					{ type: "function", function: { name: "first" } },
				],
			},
		});
		expect(a.static_prefix_hash).not.toBe(b.static_prefix_hash);
		expect(a.prefix_parts.map((part) => part.kind)).toEqual([
			"system",
			"message",
			"tool",
			"tool",
		]);
		expect(a.tool_fingerprint?.names).toEqual(["first", "second"]);
		expect(b.tool_fingerprint?.names).toEqual(["second", "first"]);
	});

	test("labels provider tools without function names by type", () => {
		const analyzer = new ChatCompletionPromptCacheRequestAnalyzer();
		const analysis = analyzer.analyze({
			provider: "zhipu",
			model: "glm-5.1",
			request: { model: "glm-5.1" },
			providerRequest: {
				model: "glm-5.1",
				messages: [],
				tools: [
					{ type: "function", function: { name: "local_shell" } },
					{
						type: "web_search",
						web_search: { enable: true, search_engine: "search_pro" },
					},
				],
			},
		});
		expect(analysis.tool_fingerprint?.names).toEqual([
			"local_shell",
			"web_search",
		]);
	});

	test("collects dynamic text candidates from instructions and system messages", () => {
		const analyzer = new ChatCompletionPromptCacheRequestAnalyzer();
		const analysis = analyzer.analyze({
			provider: "openai",
			model: "gpt-test",
			request: { model: "gpt-test", instructions: "request req_abc123" },
			providerRequest: {
				model: "gpt-test",
				messages: [{ role: "system", content: "now 2026-05-26T10:00:00Z" }],
			},
		});
		expect(analysis.dynamic_text_candidates.map((c) => c.source)).toEqual([
			"instructions",
			"message",
		]);
	});
});
