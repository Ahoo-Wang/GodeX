import { describe, expect, test } from "bun:test";
import { parseSessionConfig } from "./session";

describe("parseSessionConfig", () => {
	test("defaults to memory sessions", () => {
		expect(parseSessionConfig({})).toEqual({ backend: "memory" });
	});

	test("uses the default sqlite path when sqlite is selected without a path", () => {
		expect(parseSessionConfig({ backend: "sqlite" })).toEqual({
			backend: "sqlite",
			sqlite: { path: "./data/sessions.db" },
		});
	});

	test("uses the default sqlite path when sqlite path is blank", () => {
		expect(
			parseSessionConfig({
				backend: "sqlite",
				sqlite: { path: "   " },
			}),
		).toEqual({
			backend: "sqlite",
			sqlite: { path: "./data/sessions.db" },
		});
	});

	test("rejects unknown backends", () => {
		expect(() => parseSessionConfig({ backend: "redis" })).toThrow(
			"Invalid session backend: redis",
		);
	});
});
