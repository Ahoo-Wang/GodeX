import { describe, expect, test } from "bun:test";
import { resolveEnvVars, resolveEnvVarsDeep } from "./env-interpolation";

describe("resolveEnvVars", () => {
	test("replaces ${VAR} with environment value", () => {
		process.env.TEST_KEY = "secret123";
		try {
			expect(resolveEnvVars("Bearer ${TEST_KEY}")).toBe("Bearer secret123");
		} finally {
			delete process.env.TEST_KEY;
		}
	});

	test("leaves unresolved vars as-is", () => {
		expect(resolveEnvVars("${MISSING_VAR}")).toBe("${MISSING_VAR}");
	});

	test("replaces nested string values without mutating the input", () => {
		process.env.HOST = "example.com";
		process.env.PORT = "8080";
		const source = {
			providers: {
				zhipu: {
					base_url: "https://${HOST}:${PORT}",
					api_key: "${MISSING_KEY}",
				},
			},
		};

		try {
			expect(resolveEnvVarsDeep(source)).toEqual({
				providers: {
					zhipu: {
						base_url: "https://example.com:8080",
						api_key: "${MISSING_KEY}",
					},
				},
			});
			expect(source.providers.zhipu.base_url).toBe("https://${HOST}:${PORT}");
		} finally {
			delete process.env.HOST;
			delete process.env.PORT;
		}
	});

	test("resolves strings inside arrays", () => {
		process.env.FIRST = "one";
		try {
			expect(resolveEnvVarsDeep(["${FIRST}", 2, false])).toEqual([
				"one",
				2,
				false,
			]);
		} finally {
			delete process.env.FIRST;
		}
	});

	test("returns primitive values unchanged", () => {
		expect(resolveEnvVarsDeep(null)).toBeNull();
		expect(resolveEnvVarsDeep(42)).toBe(42);
		expect(resolveEnvVarsDeep(true)).toBe(true);
	});
});
