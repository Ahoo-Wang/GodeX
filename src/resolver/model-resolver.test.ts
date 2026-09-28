import { describe, expect, test } from "bun:test";
import { ServerError } from "../error";
import { ModelResolver } from "./model-resolver";

function expectServerErrorCode(fn: () => unknown, code: string): void {
	try {
		fn();
		throw new Error(`Expected ServerError ${code}`);
	} catch (err) {
		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(code);
	}
}

describe("ModelResolver", () => {
	const resolver = new ModelResolver({
		defaultProvider: "zhipu",
		aliases: {
			"gpt-5": "zhipu/glm-5.1",
			"gpt-4o": "zhipu/glm-4.7",
			"*": "zhipu/glm-5.1",
		},
	});

	test("resolves exact bare aliases", () => {
		expect(resolver.resolve("gpt-5")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("resolves wildcard aliases for unmatched bare selectors", () => {
		expect(resolver.resolve("gpt-5.5")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("falls back bare selectors to default provider without aliases", () => {
		const noAliases = new ModelResolver({ defaultProvider: "deepseek" });

		expect(noAliases.resolve("deepseek-chat")).toEqual({
			provider: "deepseek",
			model: "deepseek-chat",
		});
	});

	test("returns provider-qualified selectors without alias lookup", () => {
		expect(resolver.resolve("deepseek/deepseek-chat")).toEqual({
			provider: "deepseek",
			model: "deepseek-chat",
		});
	});

	test("lists resolver-owned aliases", () => {
		expect(resolver.listAliases(["zhipu"])).toEqual([
			{ alias: "gpt-5", target: { provider: "zhipu", model: "glm-5.1" } },
			{ alias: "gpt-4o", target: { provider: "zhipu", model: "glm-4.7" } },
		]);
	});

	test("rejects missing model selectors", () => {
		for (const model of [undefined, null, " "]) {
			expectServerErrorCode(
				() => resolver.resolve(model),
				"server.request.missing_model",
			);
		}
	});

	test("rejects invalid model selectors", () => {
		for (const model of ["/glm-5.1", "zhipu/", 42]) {
			expectServerErrorCode(
				() => resolver.resolve(model),
				"server.request.invalid_parameter",
			);
		}
	});
});
