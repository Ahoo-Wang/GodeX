// src/router/index.test.ts
import { describe, expect, test } from "bun:test";
import { ServerError } from "../error";
import { ModelResolver } from ".";

describe("ModelResolver", () => {
	const router = new ModelResolver("zhipu", {
		zhipu: {
			api_key: "test",
			base_url: "https://example.com",
			models: { "gpt-5": "glm-5.1", "gpt-4o": "glm-4.7", "*": "glm-5.1" },
		},
	});

	test("parses provider/model format", () => {
		const result = router.resolve("zhipu/glm-5.1");
		expect(result).toEqual({ provider: "zhipu", model: "glm-5.1" });
	});

	test("uses default provider when no prefix", () => {
		const result = router.resolve("gpt-5");
		expect(result.provider).toBe("zhipu");
		expect(result.model).toBe("glm-5.1");
	});

	test("uses wildcard fallback for unmapped models", () => {
		const result = router.resolve("unknown-model");
		expect(result).toEqual({ provider: "zhipu", model: "glm-5.1" });
	});

	test("handles multi-segment provider path", () => {
		const result = router.resolve("deepseek/deepseek-chat");
		expect(result).toEqual({ provider: "deepseek", model: "deepseek-chat" });
	});

	test("uses model mapping from provider config", () => {
		const result = router.resolve("gpt-4o");
		expect(result.model).toBe("glm-4.7");
	});

	test("provider prefix overrides default", () => {
		const result = router.resolve("deepseek/deepseek-chat");
		expect(result.provider).toBe("deepseek");
	});

	test("applies model mapping when provider prefix is used", () => {
		const result = router.resolve("zhipu/gpt-5");
		expect(result).toEqual({ provider: "zhipu", model: "glm-5.1" });
	});

	test("rejects missing model selectors", () => {
		for (const model of [undefined, null, " "]) {
			try {
				router.resolve(model as never);
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
				router.resolve(model as never);
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
