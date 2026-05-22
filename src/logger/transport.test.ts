import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { TransportTargetOptions } from "pino";
import type { LoggingConfig } from "../config/schema";
import { createTransports } from "./transport";

const packageJson = require("../../package.json") as {
	dependencies?: Record<string, string>;
};

function findFileLogTransport(
	transports: TransportTargetOptions[],
): TransportTargetOptions | undefined {
	return transports.find(
		(t) =>
			t.target === "pino/file" &&
			typeof (t.options as Record<string, unknown>)?.destination === "string",
	);
}

describe("createTransports", () => {
	test("returns pino-pretty for default console config", () => {
		const config: LoggingConfig = { level: "info" };
		const transports = createTransports(config);

		expect(transports.length).toBe(1);
		expect(transports[0]?.target).toBe("pino-pretty");
		expect(transports[0]?.level).toBe("info");
	});

	test("declares the default pretty transport as a runtime dependency", () => {
		expect(packageJson.dependencies?.["pino-pretty"]).toBeDefined();
	});

	test("uses console level override when set", () => {
		const config: LoggingConfig = {
			level: "info",
			console: { enabled: true, level: "debug" },
		};
		const transports = createTransports(config);

		expect(transports[0]?.level).toBe("debug");
	});

	test("returns pino/file when pretty is false", () => {
		const config: LoggingConfig = {
			level: "info",
			console: { enabled: true, pretty: false },
		};
		const transports = createTransports(config);

		expect(transports.length).toBe(1);
		expect(transports[0]?.target).toBe("pino/file");
		expect(transports[0]?.options).toEqual({ destination: 1 });
	});

	test("omits console transport when disabled", () => {
		const config: LoggingConfig = {
			level: "info",
			console: { enabled: false },
		};
		const transports = createTransports(config);

		expect(transports).toEqual([]);
	});

	test("adds pino/file transport for enabled file config", () => {
		const config: LoggingConfig = {
			level: "info",
			file: { enabled: true, dir: "/var/log/godex", filename: "app.log" },
		};
		const transports = createTransports(config);

		expect(transports.length).toBe(2);
		const fileTransport = findFileLogTransport(transports);
		expect(fileTransport).toBeDefined();
		expect(fileTransport?.level).toBe("info");
		expect(fileTransport?.options).toEqual({
			destination: "/var/log/godex/app.log",
			mkdir: true,
		});
	});

	test("uses file level override when set", () => {
		const config: LoggingConfig = {
			level: "info",
			file: {
				enabled: true,
				level: "debug",
				dir: "/tmp",
				filename: "godex.log",
			},
		};
		const transports = createTransports(config);

		const fileTransport = findFileLogTransport(transports);
		expect(fileTransport?.level).toBe("debug");
	});

	test("expands ~ to HOME in file dir", () => {
		const originalHome = process.env.HOME;
		process.env.HOME = "/home/testuser";

		const config: LoggingConfig = {
			level: "info",
			file: { enabled: true, dir: "~/logs", filename: "godex.log" },
		};
		const transports = createTransports(config);

		const fileTransport = findFileLogTransport(transports);
		expect(fileTransport?.options).toEqual({
			destination: "/home/testuser/logs/godex.log",
			mkdir: true,
		});

		process.env.HOME = originalHome;
	});

	test("expands ~ with os homedir when HOME is unset", () => {
		const originalHome = process.env.HOME;
		delete process.env.HOME;

		try {
			const config: LoggingConfig = {
				level: "info",
				file: { enabled: true, dir: "~/logs", filename: "godex.log" },
			};
			const transports = createTransports(config);

			const fileTransport = findFileLogTransport(transports);
			const destination = (
				fileTransport?.options as { destination?: string } | undefined
			)?.destination;
			expect(destination).toBeDefined();
			expect(path.isAbsolute(destination as string)).toBe(true);
			expect(destination).toEndWith(path.join("logs", "godex.log"));
		} finally {
			process.env.HOME = originalHome;
		}
	});

	test("does not expand non-tilde paths", () => {
		const config: LoggingConfig = {
			level: "info",
			file: { enabled: true, dir: "/absolute/path", filename: "godex.log" },
		};
		const transports = createTransports(config);

		const fileTransport = findFileLogTransport(transports);
		expect(fileTransport?.options).toEqual({
			destination: "/absolute/path/godex.log",
			mkdir: true,
		});
	});

	test("returns both console and file transports when both enabled", () => {
		const config: LoggingConfig = {
			level: "warn",
			console: { enabled: true, level: "info" },
			file: {
				enabled: true,
				level: "debug",
				dir: "/tmp",
				filename: "godex.log",
			},
		};
		const transports = createTransports(config);

		expect(transports.length).toBe(2);
		expect(transports[0]?.target).toBe("pino-pretty");
		expect(transports[0]?.level).toBe("info");
		expect(transports[1]?.target).toBe("pino/file");
		expect(transports[1]?.level).toBe("debug");
	});

	test("returns two pino/file transports when pretty is false and file is enabled", () => {
		const config: LoggingConfig = {
			level: "info",
			console: { enabled: true, pretty: false },
			file: { enabled: true, dir: "/tmp", filename: "godex.log" },
		};
		const transports = createTransports(config);

		expect(transports.length).toBe(2);
		expect(transports.every((t) => t.target === "pino/file")).toBe(true);
		const stdoutTransport = transports.find(
			(t) => (t.options as Record<string, unknown>)?.destination === 1,
		);
		expect(stdoutTransport).toBeDefined();
		expect(stdoutTransport?.options).toEqual({ destination: 1 });
		const fileTransport = findFileLogTransport(transports);
		expect(fileTransport).toBeDefined();
		expect(fileTransport?.options).toEqual({
			destination: "/tmp/godex.log",
			mkdir: true,
		});
	});
});
