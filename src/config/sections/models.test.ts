import { describe, expect, test } from "bun:test";
import { parseModelsConfig } from "./models";

describe("parseModelsConfig", () => {
	test("returns aliases when every target references a configured provider", () => {
		expect(
			parseModelsConfig(
				{ aliases: { "*": "zhipu/glm-4", "gpt-5": "openai/gpt-5" } },
				new Set(["zhipu", "openai"]),
			),
		).toEqual({
			aliases: { "*": "zhipu/glm-4", "gpt-5": "openai/gpt-5" },
		});
	});

	test("returns undefined when aliases are not configured", () => {
		expect(parseModelsConfig(undefined, new Set(["zhipu"]))).toBeUndefined();
		expect(parseModelsConfig({}, new Set(["zhipu"]))).toBeUndefined();
	});

	test("rejects alias keys that contain provider separators", () => {
		expect(() =>
			parseModelsConfig(
				{ aliases: { "openai/gpt-5": "openai/gpt-5" } },
				new Set(["openai"]),
			),
		).toThrow('models.aliases.openai/gpt-5: alias key must not contain "/"');
	});

	test("rejects aliases with non-string targets", () => {
		expect(() =>
			parseModelsConfig({ aliases: { "gpt-5": 51 } }, new Set(["openai"])),
		).toThrow("models.aliases.gpt-5 must be a string");
	});

	test("rejects aliases without provider/model targets", () => {
		expect(() =>
			parseModelsConfig({ aliases: { "gpt-5": "gpt-5" } }, new Set(["openai"])),
		).toThrow(
			'models.aliases.gpt-5: value must be "provider/model" format, got "gpt-5"',
		);
	});

	test("rejects aliases with an empty provider segment", () => {
		expect(() =>
			parseModelsConfig(
				{ aliases: { "gpt-5": "/gpt-5" } },
				new Set(["openai"]),
			),
		).toThrow('models.aliases.gpt-5: value must be "provider/model" format');
	});

	test("rejects aliases that reference unconfigured providers", () => {
		expect(() =>
			parseModelsConfig(
				{ aliases: { "gpt-5": "unknown/gpt-5" } },
				new Set(["openai"]),
			),
		).toThrow('models.aliases.gpt-5: provider "unknown" is not configured');
	});

	test("uses a null-prototype alias map", () => {
		const protoKey = "__proto__";
		const constructorKey = "constructor";
		const aliases = Object.create(null) as Record<string, unknown>;
		aliases[protoKey] = "openai/gpt-5";
		aliases[constructorKey] = "openai/gpt-4.1";

		const models = parseModelsConfig({ aliases }, new Set(["openai"]));
		const aliasMap = models?.aliases;

		expect(aliasMap).toBeDefined();
		expect(Object.getPrototypeOf(aliasMap)).toBeNull();
		expect(Object.hasOwn(aliasMap ?? {}, protoKey)).toBe(true);
		expect(aliasMap?.[protoKey]).toBe("openai/gpt-5");
		expect(aliasMap?.[constructorKey]).toBe("openai/gpt-4.1");
	});
});
