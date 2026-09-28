import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LoggingConfig } from "../config/schema";
import { buildLogSinks } from "./sinks";

describe("buildLogSinks", () => {
	test("builds a console sink for default logging config", () => {
		const result = buildLogSinks({ level: "info" });

		expect(result.sinkIds).toEqual(["console"]);
		expect(result.lowestLevel).toBe("info");
		expect(typeof result.sinks.console).toBe("function");
		expect(result.sinks.file).toBeUndefined();
	});

	test("builds no sinks when every transport is disabled", () => {
		const result = buildLogSinks({
			level: "info",
			console: { enabled: false },
		});

		expect(result.sinkIds).toEqual([]);
		expect(result.lowestLevel).toBe("fatal");
		expect(result.sinks).toEqual({});
	});

	test("builds file sink and creates its directory", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "godex-log-sinks-"));
		const logDir = path.join(dir, "logs");
		try {
			const result = buildLogSinks({
				level: "info",
				console: { enabled: false },
				file: {
					enabled: true,
					level: "debug",
					dir: logDir,
					filename: "godex.log",
				},
			});

			expect(result.sinkIds).toEqual(["file"]);
			expect(result.lowestLevel).toBe("debug");
			expect(typeof result.sinks.file).toBe("function");
			expect(existsSync(logDir)).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("selects the lowest level across console and file sinks", () => {
		const config: LoggingConfig = {
			level: "error",
			console: { enabled: true, level: "warn" },
			file: {
				enabled: true,
				level: "debug",
				dir: "/tmp",
				filename: "godex.log",
			},
		};

		const result = buildLogSinks(config);

		expect(result.sinkIds).toEqual(["console", "file"]);
		expect(result.lowestLevel).toBe("debug");
	});
});
