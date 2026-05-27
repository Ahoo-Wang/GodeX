import { describe, expect, test } from "bun:test";
import { parseServerConfig } from "./server";

describe("parseServerConfig", () => {
	test("uses overrides before file and environment values", () => {
		process.env.GODEX_PORT = "9999";
		process.env.GODEX_HOST = "127.0.0.1";
		try {
			expect(
				parseServerConfig(
					{ port: 6789, host: "0.0.0.0", idle_timeout: 10 },
					{ port: 1234, host: "localhost" },
				),
			).toEqual({
				port: 1234,
				host: "localhost",
				idle_timeout: 10,
			});
		} finally {
			delete process.env.GODEX_PORT;
			delete process.env.GODEX_HOST;
		}
	});

	test("uses environment values before defaults", () => {
		process.env.GODEX_PORT = "9999";
		process.env.GODEX_HOST = "127.0.0.1";
		try {
			expect(parseServerConfig({}, {})).toEqual({
				port: 9999,
				host: "127.0.0.1",
				idle_timeout: 0,
			});
		} finally {
			delete process.env.GODEX_PORT;
			delete process.env.GODEX_HOST;
		}
	});

	test("rejects invalid ports", () => {
		expect(() => parseServerConfig({ port: "abc" }, {})).toThrow(
			"Invalid server port: abc",
		);
	});

	test("rejects invalid environment ports", () => {
		process.env.GODEX_PORT = "abc";
		try {
			expect(() => parseServerConfig({}, {})).toThrow(
				"Invalid server port: abc",
			);
		} finally {
			delete process.env.GODEX_PORT;
		}
	});

	test("rejects empty hosts", () => {
		expect(() => parseServerConfig({ host: "" }, {})).toThrow(
			"Invalid server host: must be a non-empty string",
		);
		expect(() => parseServerConfig({ host: "   " }, {})).toThrow(
			"Invalid server host: must be a non-empty string",
		);
	});

	test("rejects non-string hosts", () => {
		expect(() => parseServerConfig({ host: 42 }, {})).toThrow(
			"Invalid server host: 42",
		);
	});

	test("trims server host values", () => {
		expect(parseServerConfig({ host: " localhost " }, {}).host).toBe(
			"localhost",
		);
	});

	test("rejects invalid idle timeout values", () => {
		for (const idle_timeout of [-1, Number.NaN, 1.5]) {
			expect(() => parseServerConfig({ idle_timeout }, {})).toThrow(
				"server.idle_timeout must be a non-negative integer",
			);
		}
	});
});
