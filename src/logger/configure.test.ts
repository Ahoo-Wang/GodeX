import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { getConfig } from "@logtape/logtape";
import type { LoggingConfig } from "../config/schema";
import { configureLogging, resetSync } from "./configure";

const packageJson = require("../../package.json") as {
	dependencies?: Record<string, string>;
};

const TEST_LOG = "/tmp/godex-transport-test.log";

afterEach(() => {
	resetSync();
	if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
});

describe("configureLogging", () => {
	test("declares @logtape/logtape as a runtime dependency", () => {
		expect(packageJson.dependencies?.["@logtape/logtape"]).toBeDefined();
	});

	test("returns false when all transports are disabled", () => {
		const config: LoggingConfig = {
			level: "info",
			console: { enabled: false },
		};
		expect(configureLogging(config)).toBe(false);
	});

	test("configures console sink for default config", () => {
		const config: LoggingConfig = { level: "info" };
		expect(configureLogging(config)).toBe(true);
		expect(getConfig()).not.toBeNull();
	});

	test("uses console level override when set", () => {
		const config: LoggingConfig = {
			level: "info",
			console: { enabled: true, level: "debug" },
		};
		expect(configureLogging(config)).toBe(true);
	});

	test("configures file sink for enabled file config", () => {
		const config: LoggingConfig = {
			level: "info",
			file: {
				enabled: true,
				dir: "/tmp",
				filename: "godex-transport-test.log",
			},
		};
		expect(configureLogging(config)).toBe(true);
	});

	test("uses file level override when set", () => {
		const config: LoggingConfig = {
			level: "info",
			file: {
				enabled: true,
				level: "debug",
				dir: "/tmp",
				filename: "godex-transport-test.log",
			},
		};
		expect(configureLogging(config)).toBe(true);
	});

	test("expands ~ to HOME in file dir", () => {
		const originalHome = process.env.HOME;
		process.env.HOME = "/tmp";

		const config: LoggingConfig = {
			level: "info",
			file: { enabled: true, dir: "~/logs-test", filename: "godex.log" },
		};
		expect(configureLogging(config)).toBe(true);

		process.env.HOME = originalHome;
	});

	test("expands ~ with os homedir when HOME is unset", () => {
		const originalHome = process.env.HOME;
		delete process.env.HOME;

		try {
			const config: LoggingConfig = {
				level: "info",
				file: { enabled: true, dir: "~/logs-test", filename: "godex.log" },
			};
			expect(configureLogging(config)).toBe(true);
		} finally {
			process.env.HOME = originalHome;
		}
	});

	test("configures both console and file sinks", () => {
		const config: LoggingConfig = {
			level: "info",
			file: {
				enabled: true,
				dir: "/tmp",
				filename: "godex-transport-test.log",
			},
		};
		expect(configureLogging(config)).toBe(true);
	});
});
