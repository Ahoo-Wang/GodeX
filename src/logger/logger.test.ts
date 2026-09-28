import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resetSync } from "@logtape/logtape";
import { createLogger } from "./logger";

describe("createLogger", () => {
	test("returns a no-op logger when all transports are disabled", () => {
		resetSync();
		const logger = createLogger({
			level: "info",
			console: { enabled: false },
		});

		expect(logger.level).toBe("info");
		expect(() => logger.info("suppressed.event")).not.toThrow();
		expect(() =>
			logger.child({ request_id: "req_1" }).warn("suppressed.child"),
		).not.toThrow();
	});

	test("does not keep the process open when all transports are disabled", () => {
		const result = spawnSync(
			process.execPath,
			[
				"-e",
				"import { createLogger } from './src/logger/index.ts'; const logger = createLogger({ level: 'info', console: { enabled: false } }); logger.info('suppressed.event');",
			],
			{
				cwd: process.cwd(),
				encoding: "utf8",
				timeout: 2000,
			},
		);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
	});
});
