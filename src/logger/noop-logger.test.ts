import { describe, expect, test } from "bun:test";
import { createNoopLogger } from "./noop-logger";

describe("createNoopLogger", () => {
	test("creates a logger with the configured level", () => {
		const logger = createNoopLogger("warn");

		expect(logger.level).toBe("warn");
	});

	test("returns itself for child loggers", () => {
		const logger = createNoopLogger("info");

		expect(logger.child({ request_id: "req_1" })).toBe(logger);
	});

	test("ignores all log levels without evaluating lazy attributes", () => {
		const logger = createNoopLogger("trace");
		let called = false;
		const lazy = () => {
			called = true;
			return { value: true };
		};

		expect(() => logger.trace("trace.event", lazy)).not.toThrow();
		expect(() => logger.debug("debug.event", lazy)).not.toThrow();
		expect(() => logger.info("info.event", lazy)).not.toThrow();
		expect(() => logger.warn("warn.event", lazy)).not.toThrow();
		expect(() => logger.error("error.event", lazy)).not.toThrow();
		expect(called).toBe(false);
	});
});
