import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ProviderMapper } from "../../../adapter/provider";
import { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { AdapterError, ProviderError } from "../../../error";
import type { Logger } from "../../../logger";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../../protocol/openai/responses";
import { Registrar } from "../../../providers/registrar";
import { handleResponses } from "./index";
import {
	type CapturedLog,
	createCapturingLogger,
	createTestApp,
	FakeMapper,
	jsonRequest,
	responseObject,
	testConfig,
} from "./test-fixtures";

describe("handleResponses", () => {
	test("maps sync requests exactly once through the adapter", async () => {
		let requestMapCalls = 0;
		const app = createTestApp(
			{
				...new FakeMapper(),
				request: {
					map(): Record<string, unknown> {
						requestMapCalls++;
						return {};
					},
				},
			},
			{
				async request(): Promise<Record<string, unknown>> {
					return {};
				},
				async stream() {
					return new ReadableStream();
				},
			},
		);

		const res = await handleResponses(jsonRequest(basicBody()), app);

		expect(res.status).toBe(200);
		expect(requestMapCalls).toBe(1);
	});

	test("rejects invalid model selectors as request errors", async () => {
		const app = createTestApp();

		for (const model of [" ", "/glm-5.1", "zhipu/", 42]) {
			const res = await handleResponses(
				jsonRequest({
					model,
					input: "hi",
				}),
				app,
			);

			expect(res.status).toBe(400);
			const body = (await res.json()) as {
				error: { code: string; message: string };
			};
			expect([
				"server.request.missing_model",
				"server.request.invalid_parameter",
			]).toContain(body.error.code);
			expect(body.error.message).toContain("model");
		}
	});

	test("returns provider errors as HTTP status before SSE starts", async () => {
		const logs: CapturedLog[] = [];
		const app = createTestApp(new FakeMapper(), {
			async request(): Promise<Record<string, unknown>> {
				return {};
			},
			async stream() {
				throw new ProviderError(
					"provider.upstream.rate_limit",
					"Too many requests",
					{
						provider: "zhipu",
						model: "glm-4",
						upstreamStatus: 429,
						upstreamBody: "rate limited",
					},
				);
			},
		});
		Object.defineProperty(app, "logger", {
			value: createCapturingLogger(logs),
		});

		const res = await handleResponses(
			jsonRequest({
				...basicBody(),
				stream: true,
			}),
			app,
		);

		expect(res.status).toBe(429);
		expect(res.headers.get("x-request-id")).toMatch(/^req_/);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("rate_limit_exceeded");
	});

	test("maps sync provider errors with request id header", async () => {
		const logs: CapturedLog[] = [];
		const app = createTestApp(new FakeMapper(), {
			async request(): Promise<Record<string, unknown>> {
				throw new ProviderError(
					"provider.upstream.timeout",
					"Request timed out",
					{
						provider: "zhipu",
						model: "glm-4",
						upstreamStatus: 408,
					},
				);
			},
			async stream() {
				return new ReadableStream({
					start(controller) {
						controller.close();
					},
				});
			},
		});
		Object.defineProperty(app, "logger", {
			value: createCapturingLogger(logs),
		});

		const res = await handleResponses(jsonRequest(basicBody()), app);

		expect(res.status).toBe(408);
		expect(res.headers.get("x-request-id")).toMatch(/^req_/);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("request_timeout");
	});

	test("returns empty body on stream setup errors", async () => {
		const app = createTestApp(new FakeMapper(), {
			async request(): Promise<Record<string, unknown>> {
				return {};
			},
			async stream() {
				return new ReadableStream({
					start(controller) {
						controller.error(
							new ProviderError(
								"provider.upstream.rate_limit",
								"Too many requests",
								{
									provider: "zhipu",
									model: "glm-4",
									upstreamStatus: 429,
									upstreamBody: "rate limited",
								},
							),
						);
					},
				});
			},
		});

		const res = await handleResponses(
			jsonRequest({
				...basicBody(),
				stream: true,
			}),
			app,
		);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("");
	});

	test("does not log errors after the SSE stream has completed", async () => {
		const loggedErrors: string[] = [];
		const logger: Logger = {
			level: "error",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: (event) => {
				loggedErrors.push(event);
			},
		};
		const mapper: ProviderMapper<
			Record<string, unknown>,
			Record<string, unknown>,
			unknown
		> = {
			...new FakeMapper(),
			stream: {
				map: (
					ctx: ResponsesContext,
					_event: JsonServerSentEvent<unknown>,
				): ResponseStreamEvent[] => [
					{
						type: "response.created",
						response: {
							...responseObject(ctx),
							status: "in_progress",
						},
					},
					{
						type: "response.completed",
						response: responseObject(ctx),
					},
				],
			},
		};

		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => ({
			name: "mock",
			mapper,
			client: {
				async request(): Promise<Record<string, unknown>> {
					return {};
				},
				async stream() {
					return new ReadableStream({
						start(controller) {
							controller.enqueue({ event: "message", data: {} });
							controller.close();
						},
					});
				},
			} as never,
		}));
		const app = new ApplicationContext(
			{ ...testConfig, logging: { level: "error" } },
			registrar,
		);
		Object.defineProperty(app, "logger", { value: logger });

		const res = await handleResponses(
			jsonRequest({
				...basicBody(),
				stream: true,
			}),
			app,
		);

		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("response.created");
		expect(loggedErrors).toEqual([]);
	});

	test("resolves the requested model once for a request", async () => {
		const app = createTestApp();
		const originalResolver = app.resolver;
		let resolveCalls = 0;
		Object.defineProperty(app, "resolver", {
			value: {
				resolve(model: string) {
					resolveCalls++;
					return originalResolver.resolve(model);
				},
			},
		});

		const res = await handleResponses(jsonRequest(basicBody()), app);

		expect(res.status).toBe(200);
		expect(resolveCalls).toBe(1);
	});

	test("logs unexpected errors with dot-only event name and request_id", async () => {
		const logs: CapturedLog[] = [];
		const app = createTestApp(
			{
				...new FakeMapper(),
				request: {
					map() {
						throw new Error("boom");
					},
				},
			},
			{
				async request(): Promise<Record<string, unknown>> {
					return {};
				},
				async stream() {
					return new ReadableStream();
				},
			},
		);
		Object.defineProperty(app, "logger", {
			value: createCapturingLogger(logs),
		});

		const res = await handleResponses(jsonRequest(basicBody()), app);

		expect(res.status).toBe(500);
		const errorLog = logs.find((log) => log.event === "godex.unexpected.error");
		expect(errorLog?.attr?.request_id).toMatch(/^req_/);
		expect(errorLog?.attr).not.toHaveProperty("requestId");
	});

	test("maps adapter translation failures to invalid request errors", async () => {
		const app = createTestApp(
			{
				request: {
					map() {
						throw new AdapterError(
							"adapter.request.unsupported_input_content",
							"Unsupported input content",
							{ provider: "zhipu", model: "glm-4" },
						);
					},
				},
				response: {
					map(ctx: ResponsesContext): ResponseObject {
						return responseObject(ctx);
					},
				},
				stream: {
					map: () => [] as ResponseStreamEvent[],
				},
			},
			{
				async request(): Promise<Record<string, unknown>> {
					return {};
				},
				async stream() {
					return new ReadableStream();
				},
			},
		);

		const res = await handleResponses(jsonRequest(basicBody()), app);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("adapter.request.unsupported_input_content");
	});
});

function basicBody(): Record<string, unknown> {
	return {
		model: "zhipu/glm-5.1",
		input: "hi",
	};
}
