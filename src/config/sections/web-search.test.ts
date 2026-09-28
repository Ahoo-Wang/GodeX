import { describe, expect, test } from "bun:test";
import { DEFAULT_WEB_SEARCH_CONFIG, parseWebSearchConfig } from "./web-search";

describe("parseWebSearchConfig", () => {
	test("uses safe compatibility defaults", () => {
		expect(parseWebSearchConfig(undefined)).toEqual(DEFAULT_WEB_SEARCH_CONFIG);
	});

	test("parses a complete web_search section", () => {
		expect(
			parseWebSearchConfig({
				enabled: false,
				mode: "godex_managed",
				provider: "zhipu",
				on_unavailable: "fail",
				max_iterations: 3,
				timeout_ms: 2500,
			}),
		).toEqual({
			enabled: false,
			mode: "godex_managed",
			provider: "zhipu",
			on_unavailable: "fail",
			max_iterations: 3,
			timeout_ms: 2500,
		});
	});

	test("rejects unsupported real provider IDs", () => {
		expect(() => parseWebSearchConfig({ provider: "brave" })).toThrow(
			/web_search.provider/,
		);
	});

	test("rejects invalid max_iterations and timeout_ms values", () => {
		expect(() => parseWebSearchConfig({ max_iterations: 0 })).toThrow(
			/web_search.max_iterations/,
		);
		expect(() => parseWebSearchConfig({ timeout_ms: -1 })).toThrow(
			/web_search.timeout_ms/,
		);
	});
});
