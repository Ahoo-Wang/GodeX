import { describe, expect, test } from "bun:test";
import { parseModelsConfig } from "./models";

describe("parseModelsConfig", () => {
	test("returns aliases when every target references a configured provider", () => {
		expect(
			parseModelsConfig(
				{ aliases: { "*": "zhipu/glm-4", deepseek: "deepseek/chat" } },
				new Set(["zhipu", "deepseek"]),
			),
		).toEqual({
			aliases: { "*": "zhipu/glm-4", deepseek: "deepseek/chat" },
		});
	});

	test("returns undefined when aliases are not configured", () => {
		expect(parseModelsConfig(undefined, new Set(["zhipu"]))).toBeUndefined();
		expect(parseModelsConfig({}, new Set(["zhipu"]))).toBeUndefined();
	});

	test("rejects alias keys that contain provider separators", () => {
		expect(() =>
			parseModelsConfig(
				{ aliases: { "deepseek/chat": "deepseek/chat" } },
				new Set(["deepseek"]),
			),
		).toThrow('models.aliases.deepseek/chat: alias key must not contain "/"');
	});

	test("rejects aliases with non-string targets", () => {
		expect(() =>
			parseModelsConfig({ aliases: { deepseek: 51 } }, new Set(["deepseek"])),
		).toThrow("models.aliases.deepseek must be a string");
	});

	test("rejects aliases without provider/model targets", () => {
		expect(() =>
			parseModelsConfig(
				{ aliases: { deepseek: "deepseek" } },
				new Set(["deepseek"]),
			),
		).toThrow(
			'models.aliases.deepseek: value must be "provider/model" format, got "deepseek"',
		);
	});

	test("rejects aliases with an empty provider segment", () => {
		expect(() =>
			parseModelsConfig(
				{ aliases: { deepseek: "/chat" } },
				new Set(["deepseek"]),
			),
		).toThrow('models.aliases.deepseek: value must be "provider/model" format');
	});

	test("rejects aliases that reference unconfigured providers", () => {
		expect(() =>
			parseModelsConfig(
				{ aliases: { deepseek: "unknown/chat" } },
				new Set(["deepseek"]),
			),
		).toThrow('models.aliases.deepseek: provider "unknown" is not configured');
	});

	test("uses a null-prototype alias map", () => {
		const protoKey = "__proto__";
		const constructorKey = "constructor";
		const aliases = Object.create(null) as Record<string, unknown>;
		aliases[protoKey] = "deepseek/chat";
		aliases[constructorKey] = "deepseek/reasoner";

		const models = parseModelsConfig({ aliases }, new Set(["deepseek"]));
		const aliasMap = models?.aliases;

		expect(aliasMap).toBeDefined();
		expect(Object.getPrototypeOf(aliasMap)).toBeNull();
		expect(Object.hasOwn(aliasMap ?? {}, protoKey)).toBe(true);
		expect(aliasMap?.[protoKey]).toBe("deepseek/chat");
		expect(aliasMap?.[constructorKey]).toBe("deepseek/reasoner");
	});
});
