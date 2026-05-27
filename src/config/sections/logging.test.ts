import { describe, expect, test } from "bun:test";
import { parseLoggingConfig } from "./logging";

describe("parseLoggingConfig", () => {
	test("parses root, console, and file logging", () => {
		expect(
			parseLoggingConfig(
				{
					level: "debug",
					console: { enabled: true, level: "info" },
					file: {
						enabled: true,
						level: "warn",
						dir: "/var/log/godex",
						filename: "godex.log",
						max_size: 1024,
						max_files: 3,
					},
				},
				undefined,
			),
		).toEqual({
			level: "debug",
			console: { enabled: true, level: "info" },
			file: {
				enabled: true,
				level: "warn",
				dir: "/var/log/godex",
				filename: "godex.log",
				max_size: 1024,
				max_files: 3,
			},
		});
	});

	test("uses override level before file and environment values", () => {
		process.env.GODEX_LOG_LEVEL = "error";
		try {
			expect(parseLoggingConfig({ level: "debug" }, "trace").level).toBe(
				"trace",
			);
		} finally {
			delete process.env.GODEX_LOG_LEVEL;
		}
	});

	test("throws when file logging is enabled without a directory", () => {
		expect(() =>
			parseLoggingConfig({
				level: "info",
				file: { enabled: true, filename: "godex.log" },
			}),
		).toThrow("logging.file.dir is required when file logging is enabled");
	});

	test("throws for invalid root log level", () => {
		expect(() => parseLoggingConfig({ level: "verbose" })).toThrow(
			"Invalid log level: verbose",
		);
	});

	test("throws for invalid console log level", () => {
		expect(() =>
			parseLoggingConfig({
				level: "info",
				console: { enabled: true, level: "verbose" },
			}),
		).toThrow("Invalid console log level: verbose");
	});

	test("throws for invalid file log level", () => {
		expect(() =>
			parseLoggingConfig({
				level: "info",
				file: {
					enabled: true,
					level: "verbose",
					dir: "/var/log/godex",
					filename: "godex.log",
				},
			}),
		).toThrow("Invalid file log level: verbose");
	});

	test("throws when file logging is enabled without a filename", () => {
		expect(() =>
			parseLoggingConfig({
				level: "info",
				file: { enabled: true, dir: "/var/log/godex" },
			}),
		).toThrow("logging.file.filename is required when file logging is enabled");
	});

	test("trims file logging paths before storing them", () => {
		expect(
			parseLoggingConfig({
				level: "info",
				file: {
					enabled: true,
					dir: " /var/log/godex ",
					filename: " godex.log ",
				},
			}).file,
		).toEqual({
			enabled: true,
			level: undefined,
			dir: "/var/log/godex",
			filename: "godex.log",
			max_size: undefined,
			max_files: undefined,
		});
	});
});
