// src/router/index.test.ts
import { describe, expect, test } from "bun:test";
import { ServerError } from "../error";
import { ModelResolver } from ".";

describe("ModelResolver", () => {
	const aliases = {
		"gpt-5": "zhipu/glm-5.1",
		"gpt-4o": "zhipu/glm-4.7",
		"*": "zhipu/glm-5.1",
	};
	const resolver = new ModelResolver("zhipu", aliases);

	// Bare names: alias matching
	test("bare name hits exact alias", () => {
		const result = resolver.resolve("gpt-5");
		expect(result).toEqual({ provider: "zhipu", model: "glm-5.1" });
	});

	test("bare name hits wildcard alias", () => {
		const result = resolver.resolve("gpt-5.5");
		expect(result).toEqual({ provider: "zhipu", model: "glm-5.1" });
	});

	test("bare name falls back to default_provider when no alias matches", () => {
		const r = new ModelResolver("zhipu", {});
		const result = r.resolve("unknown-model");
		expect(result).toEqual({ provider: "zhipu", model: "unknown-model" });
	});

	// Explicit provider/model: passthrough, no alias lookup
	test("explicit provider/model passthrough", () => {
		const result = resolver.resolve("zhipu/glm-5.1");
		expect(result).toEqual({ provider: "zhipu", model: "glm-5.1" });
	});

	test("explicit provider/model with different provider", () => {
		const result = resolver.resolve("deepseek/deepseek-chat");
		expect(result).toEqual({ provider: "deepseek", model: "deepseek-chat" });
	});

	// Bare name with no default_provider fallback
	test("bare name falls back to default_provider", () => {
		const r = new ModelResolver("openai", {});
		const result = r.resolve("gpt-4o");
		expect(result).toEqual({ provider: "openai", model: "gpt-4o" });
	});

	// Reject invalid selectors
	test("rejects missing model selectors", () => {
		for (const model of [undefined, null, " "]) {
			try {
				resolver.resolve(model as never);
				throw new Error(`Expected ${String(model)} to be rejected`);
			} catch (err) {
				expect(err).toBeInstanceOf(ServerError);
				expect((err as ServerError).code).toBe("server.request.missing_model");
			}
		}
	});

	test("rejects invalid model selectors", () => {
		for (const model of ["/glm-5.1", "zhipu/", 42]) {
			try {
				resolver.resolve(model as never);
				throw new Error(`Expected ${String(model)} to be rejected`);
			} catch (err) {
				expect(err).toBeInstanceOf(ServerError);
				expect((err as ServerError).code).toBe(
					"server.request.invalid_parameter",
				);
			}
		}
	});
});
