// src/error/server-error.test.ts
import { describe, expect, test } from "bun:test";
import { GodeXError } from "./godex-error";
import { ServerError } from "./server-error";

describe("ServerError", () => {
	test("extends GodeXError with domain server", () => {
		const err = new ServerError("server.request.invalid_json", "msg");
		expect(err).toBeInstanceOf(GodeXError);
		expect(err.domain).toBe("server");
	});

	test("defaults status to 400", () => {
		const err = new ServerError("server.request.invalid_json", "msg");
		expect(err.status).toBe(400);
	});

	test("accepts typed context", () => {
		const err = new ServerError("server.request.invalid_json", "msg", {
			path: "/v1/responses",
			method: "POST",
		});
		expect(err.context).toEqual({
			path: "/v1/responses",
			method: "POST",
		});
	});
});
