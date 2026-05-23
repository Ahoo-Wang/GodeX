// src/server/errors.test.ts

import { describe, expect, test } from "bun:test";
import { AdapterError, ProviderError } from "../error";
import {
	godeXErrorToHttp,
	jsonError,
	providerErrorToHttp,
	providerErrorToPayload,
} from "./errors";

describe("server error mapping", () => {
	test("maps provider timeouts consistently", () => {
		const err = new ProviderError(
			"provider.upstream.timeout",
			"Request timed out",
			{
				provider: "test",
				model: "test",
				upstreamStatus: 408,
			},
		);

		expect(providerErrorToHttp(err)).toEqual({
			status: 408,
			error: { code: "request_timeout", message: "Request timed out" },
		});
		expect(providerErrorToPayload(err)).toEqual({
			code: "request_timeout",
			message: "Request timed out",
		});
	});

	test("maps provider rate limits and server errors without leaking bodies", () => {
		expect(
			providerErrorToHttp(
				new ProviderError(
					"provider.upstream.rate_limit",
					"Upstream returned 429",
					{
						provider: "test",
						model: "test",
						upstreamStatus: 429,
						upstreamBody: "too many",
					},
				),
			),
		).toEqual({
			status: 429,
			error: {
				code: "rate_limit_exceeded",
				message: "Rate limit exceeded",
			},
		});
		expect(
			providerErrorToHttp(
				new ProviderError(
					"provider.upstream.server_error",
					"Upstream returned 500",
					{
						provider: "test",
						model: "test",
						upstreamStatus: 500,
						upstreamBody: { secret: "provider" },
					},
				),
			),
		).toEqual({
			status: 502,
			error: {
				code: "upstream_error",
				message: "Upstream provider error",
			},
		});
	});

	test("preserves non-5xx provider messages as upstream errors", () => {
		expect(
			providerErrorToHttp(
				new ProviderError("provider.upstream.error", "Bad upstream request", {
					provider: "test",
					model: "test",
					upstreamStatus: 400,
					upstreamBody: { error: "bad" },
				}),
			),
		).toEqual({
			status: 422,
			error: {
				code: "upstream_error",
				message: "Bad upstream request",
			},
		});
	});

	test("godeXErrorToHttp returns status, code, and message from a GodeXError", () => {
		const err = new AdapterError(
			"adapter.request.unsupported_input_content",
			"Unsupported input content",
			{
				provider: "test",
				model: "test",
			},
		);
		expect(godeXErrorToHttp(err)).toEqual({
			status: 400,
			error: {
				code: "adapter.request.unsupported_input_content",
				message: "Unsupported input content",
			},
		});
	});

	test("jsonError attaches request id as a correlation header", async () => {
		const res = jsonError(400, "invalid_request", "Bad request", {
			requestId: "req_1",
		});

		expect(res.headers.get("Content-Type")).toBe("application/json");
		expect(res.headers.get("x-request-id")).toBe("req_1");
		const body = (await res.json()) as unknown;
		expect(body).toEqual({
			error: { code: "invalid_request", message: "Bad request" },
		});
	});
});
