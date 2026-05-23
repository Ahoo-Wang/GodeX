// src/error/godex-error.test.ts
import { describe, expect, test } from "bun:test";
import { GodeXError, toLogEntry } from "./godex-error";

class TestError extends GodeXError {
	readonly domain = "test";

	constructor(
		code: string,
		message: string,
		status = 400,
		context?: Record<string, unknown>,
		cause?: Error,
	) {
		super({ code, message, status, context, cause });
	}
}

describe("GodeXError", () => {
	test("sets name to constructor name", () => {
		const err = new TestError("test.error", "test message");
		expect(err.name).toBe("TestError");
	});

	test("stores code, message, status, context", () => {
		const err = new TestError("test.error", "msg", 422, { key: "value" });
		expect(err.code).toBe("test.error");
		expect(err.message).toBe("msg");
		expect(err.status).toBe(422);
		expect(err.context).toEqual({ key: "value" });
	});

	test("defaults status to 400 and context to empty object", () => {
		const err = new TestError("test.error", "msg");
		expect(err.status).toBe(400);
		expect(err.context).toEqual({});
	});

	test("preserves cause chain", () => {
		const cause = new Error("root cause");
		const err = new TestError("test.error", "msg", 400, undefined, cause);
		expect(err.cause).toBe(cause);
	});

	test("toLogEntry returns structured object", () => {
		const err = new TestError("test.error", "msg", 400, {
			requestId: "req_1",
		});
		const entry = err.toLogEntry();
		expect(entry).toEqual({
			domain: "test",
			code: "test.error",
			message: "msg",
			status: 400,
			timestamp: expect.any(Number),
			requestId: "req_1",
		});
	});

	test("toLogEntry includes cause message when present", () => {
		const err = new TestError(
			"test.error",
			"msg",
			400,
			undefined,
			new Error("root"),
		);
		const entry = err.toLogEntry();
		expect(entry).toHaveProperty("cause", "root");
	});

	test("toLogEntry omits cause when absent", () => {
		const err = new TestError("test.error", "msg");
		const entry = err.toLogEntry();
		expect(entry).not.toHaveProperty("cause");
	});
});

describe("toLogEntry utility", () => {
	test("serializes GodeXError", () => {
		const err = new TestError("test.error", "msg", 500, { detail: "x" });
		expect(toLogEntry(err)).toEqual(err.toLogEntry());
	});

	test("fallback for non-GodeXError", () => {
		expect(toLogEntry(new Error("oops"))).toEqual({ message: "Error: oops" });
	});

	test("fallback for string", () => {
		expect(toLogEntry("plain string")).toEqual({ message: "plain string" });
	});
});
