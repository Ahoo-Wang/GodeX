// src/error/provider-error.test.ts
import { describe, expect, test } from "bun:test";
import { GodeXError } from "./godex-error";
import { ProviderError } from "./provider-error";

describe("ProviderError", () => {
	test("extends GodeXError with domain provider", () => {
		const err = new ProviderError("provider.upstream.error", "msg", {
			provider: "zhipu",
			model: "glm-4",
			upstreamStatus: 500,
		});
		expect(err).toBeInstanceOf(GodeXError);
		expect(err.domain).toBe("provider");
	});

	test("defaults status to 502", () => {
		const err = new ProviderError("provider.upstream.error", "msg", {
			provider: "zhipu",
			model: "glm-4",
			upstreamStatus: 500,
		});
		expect(err.status).toBe(502);
	});

	test("context includes upstream details", () => {
		const err = new ProviderError("provider.upstream.error", "msg", {
			provider: "zhipu",
			model: "glm-4",
			upstreamStatus: 429,
			upstreamBody: { error: "rate limited" },
		});
		expect(err.context).toEqual({
			provider: "zhipu",
			model: "glm-4",
			upstreamStatus: 429,
			upstreamBody: { error: "rate limited" },
		});
	});

	test("accepts cause", () => {
		const cause = new Error("timeout");
		const err = new ProviderError(
			"provider.upstream.timeout",
			"msg",
			{ provider: "zhipu", model: "glm-4", upstreamStatus: 408 },
			{ cause },
		);
		expect(err.cause).toBe(cause);
	});
});
