// src/error/session-error.test.ts
import { describe, expect, test } from "bun:test";
import { GodeXError } from "./godex-error";
import { SessionError } from "./session-error";

describe("SessionError", () => {
	test("extends GodeXError with domain session", () => {
		const err = new SessionError("session.chain.not_found", "msg");
		expect(err).toBeInstanceOf(GodeXError);
		expect(err.domain).toBe("session");
	});

	test("defaults status to 400", () => {
		const err = new SessionError("session.chain.not_found", "msg");
		expect(err.status).toBe(400);
	});

	test("context is optional", () => {
		const err = new SessionError("session.chain.not_found", "msg");
		expect(err.context).toEqual({});
	});

	test("accepts typed context", () => {
		const err = new SessionError("session.chain.not_found", "msg", {
			responseId: "resp_1",
			previousResponseId: "resp_parent",
		});
		expect(err.context).toEqual({
			responseId: "resp_1",
			previousResponseId: "resp_parent",
		});
	});

	test("accepts custom status and cause", () => {
		const err = new SessionError(
			"session.chain.cycle_detected",
			"msg",
			{ responseId: "resp_1" },
			{ status: 409, cause: new Error("cycle") },
		);
		expect(err.status).toBe(409);
		expect(err.cause).toBeDefined();
	});
});
