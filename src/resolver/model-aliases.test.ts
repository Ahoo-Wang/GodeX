import { describe, expect, test } from "bun:test";
import { ModelAliasCatalog } from "./model-aliases";

describe("ModelAliasCatalog", () => {
	test("resolves exact aliases before wildcard aliases", () => {
		const aliases = new ModelAliasCatalog({
			"*": "zhipu/glm-5.1",
			deepseek: "deepseek/chat",
		});

		expect(aliases.resolveBareModel("deepseek")).toEqual({
			provider: "deepseek",
			model: "chat",
		});
	});

	test("resolves wildcard aliases for unmatched bare selectors", () => {
		const aliases = new ModelAliasCatalog({ "*": "zhipu/glm-5.1" });

		expect(aliases.resolveBareModel("anything")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("ignores invalid targets defensively", () => {
		const aliases = new ModelAliasCatalog({
			"gpt-5": "invalid-target",
			"*": "/missing-provider",
		});

		expect(aliases.resolveBareModel("gpt-5")).toBeUndefined();
		expect(aliases.resolveBareModel("unknown")).toBeUndefined();
		expect(aliases.list()).toEqual([]);
	});

	test("does not read inherited object keys as aliases", () => {
		const aliases = new ModelAliasCatalog();

		expect(aliases.resolveBareModel("constructor")).toBeUndefined();
		expect(aliases.resolveBareModel("toString")).toBeUndefined();
	});

	test("uses wildcard when an exact alias target is invalid", () => {
		const aliases = new ModelAliasCatalog({
			"*": "zhipu/glm-5.1",
			"gpt-5": "invalid-target",
		});

		expect(aliases.resolveBareModel("gpt-5")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("lists only non-wildcard aliases", () => {
		const aliases = new ModelAliasCatalog({
			"*": "zhipu/glm-5.1",
			"gpt-5": "zhipu/glm-5.1",
			deepseek: "deepseek/chat",
		});

		expect(aliases.list()).toEqual([
			{ alias: "gpt-5", target: { provider: "zhipu", model: "glm-5.1" } },
			{ alias: "deepseek", target: { provider: "deepseek", model: "chat" } },
		]);
	});

	test("filters listed aliases by registered providers", () => {
		const aliases = new ModelAliasCatalog({
			"gpt-5": "zhipu/glm-5.1",
			deepseek: "deepseek/chat",
		});

		expect(aliases.list(["zhipu"])).toEqual([
			{ alias: "gpt-5", target: { provider: "zhipu", model: "glm-5.1" } },
		]);
	});
});
