import { describe, expect, test } from "bun:test";
import { BridgeError, ProviderError, SERVER_ERROR } from "../../../error";
import { responseRouteErrorToResponse } from "./error-handler";
import {
	type CapturedLog,
	createCapturingLogger,
	createTestApp,
} from "./test-fixtures";

describe("responseRouteErrorToResponse", () => {
	test("maps provider errors through upstream HTTP semantics", async () => {
		const logs: CapturedLog[] = [];
		const app = createTestApp();
		Object.defineProperty(app, "logger", {
			value: createCapturingLogger(logs),
		});

		const res = responseRouteErrorToResponse(
			new ProviderError("provider.upstream.rate_limit", "Too many requests", {
				provider: "zhipu",
				model: "glm-4",
				upstreamStatus: 429,
				upstreamBody: "rate limited",
			}),
			app,
			"req_1",
		);

		expect(res.status).toBe(429);
		expect(res.headers.get("x-request-id")).toBe("req_1");
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("rate_limit_exceeded");
		expect(logs).toContainEqual(
			expect.objectContaining({
				level: "error",
				event: "responses.request.provider.error",
			}),
		);
	});

	for (const [upstreamStatus, expectedStatus, expectedCode] of [
		[408, 408, "request_timeout"],
		[500, 502, "upstream_error"],
		[400, 422, "upstream_error"],
	] as const) {
		test(`maps upstream status ${upstreamStatus} to HTTP ${expectedStatus}`, async () => {
			const logs: CapturedLog[] = [];
			const app = createTestApp();
			Object.defineProperty(app, "logger", {
				value: createCapturingLogger(logs),
			});

			const res = responseRouteErrorToResponse(
				new ProviderError("provider.upstream.error", "Upstream failed", {
					provider: "zhipu",
					model: "glm-4",
					upstreamStatus,
				}),
				app,
			);

			expect(res.status).toBe(expectedStatus);
			const body = (await res.json()) as { error: { code: string } };
			expect(body.error.code).toBe(expectedCode);
		});
	}

	test("maps GodeX errors with original status code and message", async () => {
		const logs: CapturedLog[] = [];
		const app = createTestApp();
		Object.defineProperty(app, "logger", {
			value: createCapturingLogger(logs),
		});

		const res = responseRouteErrorToResponse(
			new BridgeError(
				"bridge.request.unsupported_input_content",
				"Unsupported input content",
				{ provider: "zhipu", model: "glm-4" },
			),
			app,
			"req_2",
		);

		expect(res.status).toBe(400);
		expect(res.headers.get("x-request-id")).toBe("req_2");
		const body = (await res.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe("bridge.request.unsupported_input_content");
		expect(body.error.message).toBe("Unsupported input content");
		expect(logs).toContainEqual(
			expect.objectContaining({
				level: "info",
				event: "responses.request.error",
			}),
		);
	});

	test("maps unexpected errors to internal server errors with request id", async () => {
		const logs: CapturedLog[] = [];
		const app = createTestApp();
		Object.defineProperty(app, "logger", {
			value: createCapturingLogger(logs),
		});

		const res = responseRouteErrorToResponse(new Error("boom"), app, "req_3");

		expect(res.status).toBe(500);
		expect(res.headers.get("x-request-id")).toBe("req_3");
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe(SERVER_ERROR);
		const errorLog = logs.find((log) => log.event === "godex.unexpected.error");
		expect(errorLog?.attr?.request_id).toBe("req_3");
		expect(errorLog?.attr).not.toHaveProperty("requestId");
	});
});
