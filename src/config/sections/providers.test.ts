import { describe, expect, test } from "bun:test";
import { parseProvidersConfig } from "./providers";

describe("parseProvidersConfig", () => {
	test("normalizes provider config entries", () => {
		expect(
			parseProvidersConfig({
				zhipu: {
					api_key: "test-key",
					base_url: "https://example.test/api",
				},
			}),
		).toEqual({
			zhipu: {
				api_key: "test-key",
				base_url: "https://example.test/api",
			},
		});
	});

	test("defaults missing api_key to an empty string", () => {
		expect(
			parseProvidersConfig({
				zhipu: { base_url: "https://example.test/api" },
			}).zhipu?.api_key,
		).toBe("");
	});

	test("trims base_url before storing it", () => {
		expect(
			parseProvidersConfig({
				zhipu: { base_url: " https://example.test/api " },
			}).zhipu?.base_url,
		).toBe("https://example.test/api");
	});

	test("rejects provider entries that are not objects", () => {
		expect(() =>
			parseProvidersConfig({ zhipu: "https://example.test/api" }),
		).toThrow("Provider zhipu must be an object");
	});

	test("rejects providers without base_url", () => {
		expect(() =>
			parseProvidersConfig({ zhipu: { api_key: "test-key" } }),
		).toThrow("Provider zhipu is missing required field: base_url");
	});

	test("rejects providers with whitespace-only base_url", () => {
		expect(() => parseProvidersConfig({ zhipu: { base_url: "   " } })).toThrow(
			"Provider zhipu is missing required field: base_url",
		);
	});
});
