import { describe, expect, test } from "bun:test";
import { minLogTapeLevel, toLogTapeLevel } from "./levels";

describe("logger level helpers", () => {
	test("maps GodeX log levels to LogTape levels", () => {
		expect(toLogTapeLevel("trace")).toBe("trace");
		expect(toLogTapeLevel("debug")).toBe("debug");
		expect(toLogTapeLevel("info")).toBe("info");
		expect(toLogTapeLevel("warn")).toBe("warning");
		expect(toLogTapeLevel("error")).toBe("error");
	});

	test("selects the lowest LogTape level from configured sinks", () => {
		expect(minLogTapeLevel(["warning", "debug", "error"])).toBe("debug");
		expect(minLogTapeLevel(["error"])).toBe("error");
	});

	test("uses fatal when no sinks are configured", () => {
		expect(minLogTapeLevel([])).toBe("fatal");
	});
});
