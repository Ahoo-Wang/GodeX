import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ProviderMapper } from "../../../adapter/adapter";
import { DEFAULT_CAPABILITIES } from "../../../adapter/provider";
import type { GodexConfig } from "../../../config";
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

const config: GodexConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "test-key",
			base_url: "http://127.0.0.1:1",
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

class FakeMapper
	implements
		ProviderMapper<Record<string, unknown>, Record<string, unknown>, unknown>
{
	readonly request = {
		map: (): Record<string, unknown> => ({}),
	};

	readonly response = {
		map: (ctx: ResponsesContext): ResponseObject => ({
			id: ctx.responseId,
			object: "response",
			created_at: ctx.createdAt,
			status: "completed",
			model: ctx.resolved.model,
			output: [],
		}),
	};

	readonly stream = {
		map: (
			_ctx: ResponsesContext,
			_event: JsonServerSentEvent<unknown>,
		): ResponseStreamEvent[] => [],
		buildResponseObject: (ctx: ResponsesContext): ResponseObject => ({
			id: ctx.responseId,
			object: "response",
			created_at: ctx.createdAt,
			status: "completed",
			model: ctx.resolved.model,
			output: [],
		}),
	};
}

function createTestApp(
	mapper: ProviderMapper<unknown, unknown, unknown>,
	chatClient: unknown,
): ApplicationContext {
	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () => ({
		name: "mock",
		capabilities: DEFAULT_CAPABILITIES,
		mapper,
		chatClient: chatClient as never,
	}));
	return new ApplicationContext(config, registrar);
}

describe("handleResponses stream errors", () => {
	test("rejects previous_response_id and conversation together before resolving session", async () => {
		const app = createTestApp(new FakeMapper(), {
			async chat(): Promise<Record<string, unknown>> {
				return {};
			},
			async streamChat() {
				return new ReadableStream();
			},
		});

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
					previous_response_id: "resp_missing",
					conversation: { id: "conv_1" },
				}),
			}),
			app,
		);

		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe("server.request.invalid_parameter");
		expect(body.error.message).toContain("previous_response_id");
		expect(body.error.message).toContain("conversation");
	});

	test("rejects invalid model selectors as request errors", async () => {
		const app = createTestApp(new FakeMapper(), {
			async chat(): Promise<Record<string, unknown>> {
				return {};
			},
			async streamChat() {
				return new ReadableStream();
			},
		});

		for (const model of [" ", "/glm-5.1", "zhipu/", 42]) {
			const res = await handleResponses(
				new Request("http://godex.test/v1/responses", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model,
						input: "hi",
					}),
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

	test("propagates stream body errors instead of encoding SSE error events", async () => {
		const app = createTestApp(new FakeMapper(), {
			async chat(): Promise<Record<string, unknown>> {
				return {};
			},
			async streamChat() {
				const stream = new ReadableStream({
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
				return stream;
			},
		});

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
					stream: true,
				}),
			}),
			app,
		);

		expect(res.status).toBe(200);
		await expect(res.text()).rejects.toThrow("Too many requests");
	});

	test("does not log errors after the SSE stream has completed", async () => {
		const loggedErrors: string[] = [];
		const logger: Logger = {
			level: "error",
			component: "server",
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
					_ctx: ResponsesContext,
					_event: JsonServerSentEvent<unknown>,
				): ResponseStreamEvent[] => [
					{
						type: "response.created",
						response: {
							id: _ctx.responseId,
							object: "response",
							created_at: _ctx.createdAt,
							status: "in_progress",
							model: _ctx.resolved.model,
							output: [],
						},
					},
					{
						type: "response.completed",
						response: {
							id: _ctx.responseId,
							object: "response",
							created_at: _ctx.createdAt,
							status: "completed",
							model: _ctx.resolved.model,
							output: [],
						},
					},
				],
				buildResponseObject: (ctx: ResponsesContext): ResponseObject => ({
					id: ctx.responseId,
					object: "response",
					created_at: ctx.createdAt,
					status: "completed",
					model: ctx.resolved.model,
					output: [],
				}),
			},
		};

		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => ({
			name: "mock",
			capabilities: DEFAULT_CAPABILITIES,
			mapper,
			chatClient: {
				async chat(): Promise<Record<string, unknown>> {
					return {};
				},
				async streamChat() {
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
			{ ...config, logging: { level: "error" } },
			registrar,
		);
		// Override logger to capture errors
		Object.defineProperty(app, "logger", { value: logger });

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
					stream: true,
				}),
			}),
			app,
		);

		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("response.created");
		expect(loggedErrors).toEqual([]);
	});

	test("returns provider errors as HTTP status before SSE starts", async () => {
		const app = createTestApp(new FakeMapper(), {
			async chat(): Promise<Record<string, unknown>> {
				return {};
			},
			async streamChat() {
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

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
					stream: true,
				}),
			}),
			app,
		);

		expect(res.status).toBe(429);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("rate_limit_exceeded");
	});

	test("maps sync provider timeouts to request_timeout responses", async () => {
		const app = createTestApp(new FakeMapper(), {
			async chat(): Promise<Record<string, unknown>> {
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
			async streamChat() {
				return new ReadableStream();
			},
		});

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
				}),
			}),
			app,
		);

		expect(res.status).toBe(408);
		expect(res.headers.get("x-request-id")).toMatch(/^req_/);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("request_timeout");
	});

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
				async chat(): Promise<Record<string, unknown>> {
					return {};
				},
				async streamChat() {
					return new ReadableStream();
				},
			},
		);

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
				}),
			}),
			app,
		);

		expect(res.status).toBe(200);
		expect(requestMapCalls).toBe(1);
	});

	test("resolves the requested model once for a request", async () => {
		const app = createTestApp(new FakeMapper(), {
			async chat(): Promise<Record<string, unknown>> {
				return {};
			},
			async streamChat() {
				return new ReadableStream();
			},
		});
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

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
				}),
			}),
			app,
		);

		expect(res.status).toBe(200);
		expect(resolveCalls).toBe(1);
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
						return {
							id: ctx.responseId,
							object: "response",
							created_at: ctx.createdAt,
							status: "completed",
							model: ctx.resolved.model,
							output: [],
						};
					},
				},
				stream: {
					map: () => [] as ResponseStreamEvent[],
					buildResponseObject(ctx: ResponsesContext): ResponseObject {
						return {
							id: ctx.responseId,
							object: "response",
							created_at: ctx.createdAt,
							status: "completed",
							model: ctx.resolved.model,
							output: [],
						};
					},
				},
			},
			{
				async chat(): Promise<Record<string, unknown>> {
					return {};
				},
				async streamChat() {
					return new ReadableStream();
				},
			},
		);

		const res = await handleResponses(
			new Request("http://godex.test/v1/responses", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: "zhipu/glm-5.1",
					input: "hi",
				}),
			}),
			app,
		);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("adapter.request.unsupported_input_content");
	});
});
