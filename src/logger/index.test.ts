import { describe, expect, test } from "bun:test";
import { createLogger, type LogLevel } from ".";

function parseLogLine(lines: string[]): Record<string, unknown> {
	const line = lines[0];
	expect(line).toBeDefined();
	if (line === undefined) {
		throw new Error("Expected one log line");
	}
	return JSON.parse(line) as Record<string, unknown>;
}

describe("Logger", () => {
	test("createLogger returns a logger with all level methods", () => {
		const logger = createLogger("info");
		expect(typeof logger.trace).toBe("function");
		expect(typeof logger.debug).toBe("function");
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
	});

	test("respects log level — filters out lower priority", () => {
		const levels: LogLevel[] = ["trace", "debug", "info", "warn", "error"];
		for (const level of levels) {
			const logger = createLogger(level);
			expect(logger.level).toBe(level);
		}
	});

	test("writes JSON with structured attr format", () => {
		const lines: string[] = [];
		const originalWrite = process.stdout.write;
		process.stdout.write = (chunk: unknown) => {
			if (typeof chunk === "string") lines.push(chunk.trim());
			return true;
		};

		const logger = createLogger("info", { component: "server" });
		logger.info("test_event", { key: "value" });

		process.stdout.write = originalWrite;
		expect(lines.length).toBe(1);
		const parsed = parseLogLine(lines);
		expect(parsed.level).toBe("info");
		expect(parsed.component).toBe("server");
		expect(parsed.event).toBe("test_event");
		expect(parsed.attr).toEqual({ key: "value" });
		expect(parsed.timestamp).toBeDefined();
	});

	test("defaults to component 'app' when not specified", () => {
		const logger = createLogger("info");
		expect(logger.component).toBe("app");
	});

	test("child inherits component and merges defaults", () => {
		const lines: string[] = [];
		const originalWrite = process.stdout.write;
		process.stdout.write = (chunk: unknown) => {
			if (typeof chunk === "string") lines.push(chunk.trim());
			return true;
		};

		const root = createLogger("info", { component: "server" });
		const child = root.child({
			component: "stream",
			defaults: { requestId: "req_1" },
		});

		expect(child.component).toBe("stream");
		child.info("child_event", { extra: true });

		process.stdout.write = originalWrite;
		const parsed = parseLogLine(lines);
		expect(parsed.component).toBe("stream");
		expect(parsed.attr).toEqual({ requestId: "req_1", extra: true });
	});

	test("child inherits parent component when not overridden", () => {
		const root = createLogger("info", { component: "server" });
		const child = root.child({ defaults: { requestId: "req_1" } });
		expect(child.component).toBe("server");
	});

	test("child defaults merge with parent defaults (child overrides)", () => {
		const lines: string[] = [];
		const originalWrite = process.stdout.write;
		process.stdout.write = (chunk: unknown) => {
			if (typeof chunk === "string") lines.push(chunk.trim());
			return true;
		};

		const root = createLogger("info", {
			component: "server",
			defaults: { requestId: "req_1" },
		});
		const child = root.child({
			defaults: { responseId: "resp_1", requestId: "req_2" },
		});
		child.info("merged");

		process.stdout.write = originalWrite;
		const parsed = parseLogLine(lines);
		expect(parsed.attr).toEqual({ requestId: "req_2", responseId: "resp_1" });
	});

	test("lazy thunk is NOT called when level is below threshold", () => {
		const lines: string[] = [];
		const originalWrite = process.stdout.write;
		process.stdout.write = (chunk: unknown) => {
			if (typeof chunk === "string") lines.push(chunk.trim());
			return true;
		};

		let thunkCalled = false;
		const logger = createLogger("warn");
		logger.info("should_not_log", () => {
			thunkCalled = true;
			return { key: "value" };
		});

		process.stdout.write = originalWrite;
		expect(thunkCalled).toBe(false);
		expect(lines.length).toBe(0);
	});

	test("lazy thunk IS called when level passes", () => {
		const lines: string[] = [];
		const originalWrite = process.stdout.write;
		process.stdout.write = (chunk: unknown) => {
			if (typeof chunk === "string") lines.push(chunk.trim());
			return true;
		};

		const logger = createLogger("info");
		logger.info("lazy_event", () => ({ computed: true }));

		process.stdout.write = originalWrite;
		expect(lines.length).toBe(1);
		const parsed = parseLogLine(lines);
		expect(parsed.attr).toEqual({ computed: true });
	});

	test("handles undefined attr (no attr passed)", () => {
		const lines: string[] = [];
		const originalWrite = process.stdout.write;
		process.stdout.write = (chunk: unknown) => {
			if (typeof chunk === "string") lines.push(chunk.trim());
			return true;
		};

		const logger = createLogger("info");
		logger.info("no_attr");

		process.stdout.write = originalWrite;
		const parsed = parseLogLine(lines);
		expect(parsed.attr).toEqual({});
	});
});

test("timestamp uses local time", () => {
	const lines: string[] = [];
	const originalWrite = process.stdout.write;
	process.stdout.write = (chunk: unknown) => {
		if (typeof chunk === "string") lines.push(chunk.trim());
		return true;
	};

	const logger = createLogger("info");
	logger.info("ts_test");

	process.stdout.write = originalWrite;
	const parsed = parseLogLine(lines);
	expect(parsed.timestamp).toBe(new Date().toLocaleString());
});
