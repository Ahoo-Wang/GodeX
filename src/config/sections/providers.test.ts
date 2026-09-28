import { describe, expect, test } from "bun:test";
import { parseProvidersConfig } from "./providers";

describe("parseProvidersConfig", () => {
	test("normalizes provider config entries", () => {
		expect(
			parseProvidersConfig({
				zhipu: {
					spec: "zhipu",
					credentials: { api_key: "test-key" },
					endpoint: { base_url: "https://example.test/api" },
				},
			}),
		).toEqual({
			zhipu: {
				spec: "zhipu",
				credentials: { api_key: "test-key" },
				endpoint: { base_url: "https://example.test/api" },
			},
		});
	});

	test("defaults missing credentials api_key to an empty string", () => {
		expect(
			parseProvidersConfig({
				zhipu: {
					spec: "zhipu",
					endpoint: { base_url: "https://example.test/api" },
				},
			}).zhipu?.credentials.api_key,
		).toBe("");
	});

	test("trims base_url before storing it", () => {
		expect(
			parseProvidersConfig({
				zhipu: {
					spec: "zhipu",
					endpoint: { base_url: " https://example.test/api " },
				},
			}).zhipu?.endpoint?.base_url,
		).toBe("https://example.test/api");
	});

	test("rejects provider entries that are not objects", () => {
		expect(() =>
			parseProvidersConfig({ zhipu: "https://example.test/api" }),
		).toThrow("Provider zhipu must be an object");
	});

	test("uses provider name as spec when spec is not declared", () => {
		const providers = parseProvidersConfig({
			zhipu: {
				api_key: "test-key",
				base_url: "https://legacy.example.test",
			},
		});

		expect(providers.zhipu?.spec).toBe("zhipu");
	});

	test("uses a null-prototype provider map", () => {
		const protoKey = "__proto__";
		const constructorKey = "constructor";
		const raw = Object.create(null) as Record<string, unknown>;
		raw[protoKey] = {
			spec: "zhipu",
			endpoint: { base_url: "https://proto.example.test/api" },
		};
		raw[constructorKey] = {
			spec: "deepseek",
			endpoint: { base_url: "https://constructor.example.test/api" },
		};

		const providers = parseProvidersConfig(raw);

		expect(Object.getPrototypeOf(providers)).toBeNull();
		expect(Object.hasOwn(providers, protoKey)).toBe(true);
		expect(providers[protoKey]?.endpoint?.base_url).toBe(
			"https://proto.example.test/api",
		);
		expect(providers[constructorKey]?.endpoint?.base_url).toBe(
			"https://constructor.example.test/api",
		);
	});
});
