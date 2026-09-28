import { describe, expect, test } from "bun:test";
import { validateProviderPackageShape } from "./validation";

describe("ProviderSpec package structure", () => {
	test("accepts a provider edge package without mapper directory", () => {
		expect(
			validateProviderPackageShape("example", [
				"src/providers/example/spec.ts",
				"src/providers/example/client.ts",
				"src/providers/example/index.ts",
				"src/providers/example/hooks.ts",
			]),
		).toEqual([]);
	});

	test("rejects mapper forest files", () => {
		expect(
			validateProviderPackageShape("zhipu", [
				"src/providers/zhipu/spec.ts",
				"src/providers/zhipu/client.ts",
				"src/providers/zhipu/index.ts",
				"src/providers/zhipu/mapper/request-options.ts",
			]),
		).toEqual([
			{
				provider: "zhipu",
				path: "src/providers/zhipu/mapper/request-options.ts",
				reason: "ProviderSpec providers must not contain mapper/ files.",
			},
		]);
	});

	test("rejects extra provider edge files", () => {
		expect(
			validateProviderPackageShape("example", [
				"src/providers/example/spec.ts",
				"src/providers/example/client.ts",
				"src/providers/example/index.ts",
				"src/providers/example/extra.ts",
			]),
		).toEqual([
			{
				provider: "example",
				path: "src/providers/example/extra.ts",
				reason:
					"ProviderSpec providers may only expose spec.ts, client.ts, index.ts, hooks.ts, tests, and protocol DTOs.",
			},
		]);
	});

	test("reports mapper, extra file, and missing required file violations together", () => {
		expect(
			validateProviderPackageShape("example", [
				"src/providers/example/spec.ts",
				"src/providers/example/mapper/request-options.ts",
				"src/providers/example/extra.ts",
			]).map((violation) => violation.reason),
		).toEqual([
			"ProviderSpec providers must not contain mapper/ files.",
			"ProviderSpec providers may only expose spec.ts, client.ts, index.ts, hooks.ts, tests, and protocol DTOs.",
			"ProviderSpec providers must expose client.ts.",
			"ProviderSpec providers must expose index.ts.",
		]);
	});

	test("requires spec, client, and index files", () => {
		expect(
			validateProviderPackageShape("deepseek", [
				"src/providers/deepseek/spec.ts",
			]).map((violation) => violation.reason),
		).toEqual([
			"ProviderSpec providers must expose client.ts.",
			"ProviderSpec providers must expose index.ts.",
		]);
	});
});
