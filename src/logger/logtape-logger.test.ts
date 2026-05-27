import { describe, expect, test } from "bun:test";
import {
	configureSync,
	getLogger,
	type LogRecord,
	type LogLevel as LogTapeLevel,
	resetSync,
	type Sink,
} from "@logtape/logtape";
import type { LogLevel } from "../config/schema";
import { wrapLogTape } from "./logtape-logger";

const TO_LOGTAPE: Record<string, LogTapeLevel> = {
	trace: "trace",
	debug: "debug",
	info: "info",
	warn: "warning",
	error: "error",
};

function createCapturingLogger(level: string = "info") {
	resetSync();
	const records: LogRecord[] = [];
	const sink: Sink = (record) => {
		if (record.category[0] === "logtape") return;
		records.push(record);
	};

	configureSync({
		sinks: { capture: sink },
		loggers: [
			{
				category: [],
				lowestLevel: TO_LOGTAPE[level],
				sinks: ["capture"],
			},
		],
	});

	return {
		logger: wrapLogTape(getLogger([]), level as LogLevel),
		records,
	};
}

function firstRecord(records: LogRecord[]): LogRecord {
	const rec = records[0];
	if (!rec) throw new Error("Expected at least one log record");
	return rec;
}

describe("wrapLogTape", () => {
	test("returns a logger with all level methods", () => {
		const { logger } = createCapturingLogger();
		expect(typeof logger.trace).toBe("function");
		expect(typeof logger.debug).toBe("function");
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
	});

	test("exposes the configured level", () => {
		const { logger } = createCapturingLogger("info");
		expect(logger.level).toBe("info");
	});

	test("captures event as message with properties", () => {
		const { logger, records } = createCapturingLogger();
		logger.info("test.event", { key: "value" });
		expect(records.length).toBe(1);
		const rec = firstRecord(records);
		expect(String(rec.message[0])).toBe("test.event");
		expect(rec.properties.key).toBe("value");
		expect(rec.level).toBe("info");
	});

	test("forwards trace debug and error levels", () => {
		const { logger, records } = createCapturingLogger("trace");
		logger.trace("trace.event");
		logger.debug("debug.event");
		logger.error("error.event");

		expect(records.map((record) => record.level)).toEqual([
			"trace",
			"debug",
			"error",
		]);
		expect(records.map((record) => String(record.message[0]))).toEqual([
			"trace.event",
			"debug.event",
			"error.event",
		]);
	});

	test("does not let attrs override the event name", () => {
		const { logger, records } = createCapturingLogger();
		logger.info("test.event", { event: "spoofed.event", key: "value" });

		const rec = firstRecord(records);
		expect(String(rec.message[0])).toBe("test.event");
		expect(rec.properties.event).toBe("spoofed.event");
		expect(rec.properties.key).toBe("value");
	});

	test("respects log level - filters out lower priority", () => {
		const { logger, records } = createCapturingLogger("warn");
		logger.info("should_not_appear");
		logger.warn("should_appear");
		expect(
			records.some((r) => String(r.message[0]).includes("should_appear")),
		).toBe(true);
		expect(
			records.some((r) => String(r.message[0]).includes("should_not_appear")),
		).toBe(false);
	});

	test("child merges bindings into log entries", () => {
		const { logger, records } = createCapturingLogger();
		const child = logger.child({ request_id: "req_1", response_id: "resp_1" });
		child.info("child.event", { extra: true });
		const rec = firstRecord(records);
		expect(rec.properties.request_id).toBe("req_1");
		expect(rec.properties.response_id).toBe("resp_1");
		expect(rec.properties.extra).toBe(true);
	});

	test("child inherits parent level", () => {
		const { logger } = createCapturingLogger();
		const child = logger.child({ key: "val" });
		expect(child.level).toBe("info");
	});

	test("lazy thunk is NOT called when level is below threshold", () => {
		let thunkCalled = false;
		const { logger } = createCapturingLogger("warn");
		logger.info("should_not_log", () => {
			thunkCalled = true;
			return { key: "value" };
		});
		expect(thunkCalled).toBe(false);
	});

	test("lazy thunk IS called when level passes", () => {
		const { logger, records } = createCapturingLogger();
		logger.info("lazy.event", () => ({ computed: true }));
		expect(firstRecord(records).properties.computed).toBe(true);
	});

	test("handles no attr", () => {
		const { logger, records } = createCapturingLogger();
		logger.info("no_attr");
		expect(String(firstRecord(records).message[0])).toBe("no_attr");
	});
});
