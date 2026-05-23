// src/error/adapter-error.test.ts
import { describe, expect, test } from "bun:test";
import { AdapterError } from "./adapter-error";
import { GodeXError } from "./godex-error";

describe("AdapterError", () => {
	test("extends GodeXError with domain adapter", () => {
		const err = new AdapterError(
			"adapter.request.unsupported_parameter",
			"msg",
			{
				provider: "zhipu",
				model: "glm-4",
			},
		);
		expect(err).toBeInstanceOf(GodeXError);
		expect(err.domain).toBe("adapter");
	});

	test("defaults status to 400", () => {
		const err = new AdapterError(
			"adapter.request.unsupported_parameter",
			"msg",
			{
				provider: "zhipu",
				model: "glm-4",
			},
		);
		expect(err.status).toBe(400);
	});

	test("accepts custom status and cause", () => {
		const cause = new Error("root");
		const err = new AdapterError(
			"adapter.request.unsupported_parameter",
			"msg",
			{ provider: "zhipu", model: "glm-4" },
			{ status: 422, cause },
		);
		expect(err.status).toBe(422);
		expect(err.cause).toBe(cause);
	});

	test("context includes provider and model", () => {
		const err = new AdapterError(
			"adapter.request.unsupported_parameter",
			"msg",
			{
				provider: "zhipu",
				model: "glm-4",
				parameter: "truncation",
			},
		);
		expect(err.context).toEqual({
			provider: "zhipu",
			model: "glm-4",
			parameter: "truncation",
		});
	});
});
