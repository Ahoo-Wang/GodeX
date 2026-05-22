import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { Writable } from "node:stream";
import pino from "pino";
import { createLogger, formatTimestamp, wrapPino } from "./index";

function createInMemoryLogger(level: string = "info") {
	const chunks: string[] = [];
	const sink = new Writable({
		write(chunk: Buffer, _encoding: string, callback: () => void) {
			chunks.push(chunk.toString().trim());
			callback();
		},
	});
	const pinoInstance = pino(
		{
			level,
			timestamp: () => `,"time":"${formatTimestamp(new Date())}"`,
		},
		sink,
	);
	const logger = wrapPino(pinoInstance);
	return { logger, chunks };
}

describe("Logger (wrapPino)", () => {
	test("returns a logger with all level methods", () => {
		const { logger } = createInMemoryLogger();
		expect(typeof logger.trace).toBe("function");
		expect(typeof logger.debug).toBe("function");
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
	});

	test("exposes the configured level", () => {
		const { logger } = createInMemoryLogger("info");
		expect(logger.level).toBe("info");
	});

	test("writes JSON with event as top-level field", () => {
		const { logger, chunks } = createInMemoryLogger();
		logger.info("test.event", { key: "value" });
		expect(chunks.length).toBe(1);
		const parsed = JSON.parse(chunks[0] as string);
		expect(parsed.event).toBe("test.event");
		expect(parsed.key).toBe("value");
		expect(parsed.level).toBe(30);
		expect(parsed.time).toBeDefined();
	});

	test("does not let attrs override the event name", () => {
		const { logger, chunks } = createInMemoryLogger();
		logger.info("test.event", { event: "spoofed.event", key: "value" });

		const parsed = JSON.parse(chunks[0] as string);
		expect(parsed.event).toBe("test.event");
		expect(parsed.key).toBe("value");
	});

	test("respects log level - filters out lower priority", () => {
		const { logger, chunks } = createInMemoryLogger("warn");
		logger.info("should_not_appear");
		logger.warn("should_appear");
		expect(chunks.some((l) => l.includes("should_appear"))).toBe(true);
		expect(chunks.some((l) => l.includes("should_not_appear"))).toBe(false);
	});

	test("child merges bindings into log entries", () => {
		const { logger, chunks } = createInMemoryLogger();
		const child = logger.child({ request_id: "req_1", response_id: "resp_1" });
		child.info("child.event", { extra: true });
		const parsed = JSON.parse(chunks[0] as string);
		expect(parsed.request_id).toBe("req_1");
		expect(parsed.response_id).toBe("resp_1");
		expect(parsed.extra).toBe(true);
	});

	test("child inherits parent level", () => {
		const { logger } = createInMemoryLogger();
		const child = logger.child({ key: "val" });
		expect(child.level).toBe("info");
	});

	test("lazy thunk is NOT called when level is below threshold", () => {
		let thunkCalled = false;
		const { logger } = createInMemoryLogger("warn");
		logger.info("should_not_log", () => {
			thunkCalled = true;
			return { key: "value" };
		});
		expect(thunkCalled).toBe(false);
	});

	test("lazy thunk IS called when level passes", () => {
		const { logger, chunks } = createInMemoryLogger();
		logger.info("lazy.event", () => ({ computed: true }));
		const parsed = JSON.parse(chunks[0] as string);
		expect(parsed.computed).toBe(true);
	});

	test("handles no attr", () => {
		const { logger, chunks } = createInMemoryLogger();
		logger.info("no_attr");
		const parsed = JSON.parse(chunks[0] as string);
		expect(parsed.event).toBe("no_attr");
	});

	test("timestamp is human-readable format", () => {
		const { logger, chunks } = createInMemoryLogger();
		logger.info("ts.test");
		const parsed = JSON.parse(chunks[0] as string);
		expect(parsed.time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
	});

	test("returns a no-op logger when all transports are disabled", () => {
		const logger = createLogger({ level: "info", console: { enabled: false } });

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
