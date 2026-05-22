import { describe, expect, test } from "bun:test";
import { DEFAULT_CAPABILITIES } from "../adapter/capabilities";
import type { Provider } from "../adapter/provider";
import type { GodexConfig } from "../config";
import {
	SERVER_PROVIDER_NOT_REGISTERED,
	SERVER_REQUEST_INVALID_PARAMETER,
	SERVER_REQUEST_MISSING_MODEL,
	SESSION_CHAIN_NOT_FOUND,
	ServerError,
	SessionError,
} from "../error";
import { Registrar } from "../providers/registrar";
import type { ResolvedModel } from "../resolver";
import type { StoredResponseSession } from "../session";
import { ApplicationContext } from "./application-context";
import { ResponsesContext } from "./responses-context";

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
	logging: { level: "info" },
};

function createTestApp(): ApplicationContext {
	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () => ({
		name: "mock",
		capabilities: DEFAULT_CAPABILITIES,
		mapper: {
			request: { map: () => ({}) },
			response: { map: () => ({}) as never },
			stream: {
				map: () => [] as never[],
				buildResponseObject: () => ({}) as never,
			},
		},
		chatClient: {
			chat: async () => ({}),
			streamChat: async () => new ReadableStream(),
		},
	}));
	return new ApplicationContext(config, registrar);
}

function mockResolved(overrides: Partial<ResolvedModel> = {}): ResolvedModel {
	return { provider: "zhipu", model: "glm-5.1", ...overrides };
}

function mockProvider(): Provider<unknown, unknown, unknown> {
	return {
		name: "mock",
		capabilities: DEFAULT_CAPABILITIES,
		mapper: {
			request: { map: () => ({}) },
			response: { map: () => ({}) as never },
			stream: {
				map: () => [] as never[],
				buildResponseObject: () => ({}) as never,
			},
		},
		chatClient: {
			chat: async () => ({}),
			streamChat: async () => new ReadableStream(),
		},
	};
}

describe("ResponsesContext", () => {
	test("stores app, request, resolved, provider from constructor", () => {
		const app = createTestApp();
		const resolved = mockResolved();
		const provider = mockProvider();
		const ctx = new ResponsesContext(
			app,
			{ model: "glm-5.1", input: "hi" },
			null,
			resolved,
			provider,
		);

		expect(ctx.app).toBe(app);
		expect(ctx.resolved).toBe(resolved);
		expect(ctx.provider).toBe(provider);
	});

	test("auto-generates IDs", () => {
		const app = createTestApp();
		const ctx = new ResponsesContext(
			app,
			{ model: "glm-5.1", input: "hi" },
			null,
			mockResolved(),
			mockProvider(),
		);

		expect(ctx.responseId).toMatch(/^resp_/);
		expect(ctx.requestId).toMatch(/^req_/);
		expect(ctx.createdAt).toBeGreaterThan(0);
	});

	test("creates child logger with requestId and responseId", () => {
		const app = createTestApp();
		const ctx = new ResponsesContext(
			app,
			{ model: "glm-5.1", input: "hi" },
			null,
			mockResolved(),
			mockProvider(),
		);

		expect(ctx.logger).not.toBe(app.logger);
		expect(ctx.logger.level).toBe("info");
	});

	test("passes session through", () => {
		const app = createTestApp();
		const session = {
			previous_response_id: "resp_prev",
			turns: [],
			input_items: [],
		};
		const ctx = new ResponsesContext(
			app,
			{ model: "glm-5.1", input: "hi" },
			session,
			mockResolved(),
			mockProvider(),
		);

		expect(ctx.session).toBe(session);
	});

	test("attributes is an empty mutable map at construction", () => {
		const app = createTestApp();
		const ctx = new ResponsesContext(
			app,
			{ model: "glm-5.1", input: "hi" },
			null,
			mockResolved(),
			mockProvider(),
		);

		expect(ctx.attributes.size).toBe(0);

		ctx.attributes.set("traceId", "trace_123");
		ctx.attributes.set("userId", "user_456");
		expect(ctx.attributes.get("traceId")).toBe("trace_123");
		expect(ctx.attributes.get("userId")).toBe("user_456");
		expect(ctx.attributes.size).toBe(2);
	});
});

describe("ResponsesContext.create", () => {
	test("resolves model and provider, creates context", async () => {
		const app = createTestApp();
		const ctx = await ResponsesContext.create(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
		});

		expect(ctx.resolved).toEqual({ provider: "zhipu", model: "glm-5.1" });
		expect(ctx.provider).toBeDefined();
		expect(ctx.provider.name).toBe("mock");
		expect(ctx.session).toBeNull();
		expect(ctx.responseId).toMatch(/^resp_/);
	});

	test("uses default_provider when model has no slash", async () => {
		const app = createTestApp();
		const ctx = await ResponsesContext.create(app, {
			model: "glm-5.1",
			input: "hi",
		});

		expect(ctx.resolved.provider).toBe("zhipu");
		expect(ctx.resolved.model).toBe("glm-5.1");
	});

	test("throws ServerError for missing model", async () => {
		const app = createTestApp();
		const err = await ResponsesContext.create(app, {
			model: undefined as never,
			input: "hi",
		}).catch((e) => e);
		expect(err instanceof ServerError).toBe(true);
		expect((err as ServerError).code).toBe(SERVER_REQUEST_MISSING_MODEL);
	});

	test("throws ServerError for invalid model selector", async () => {
		const app = createTestApp();
		const err = await ResponsesContext.create(app, {
			model: " /glm-5.1",
			input: "hi",
		}).catch((e) => e);
		expect(err instanceof ServerError).toBe(true);
		expect((err as ServerError).code).toBe(SERVER_REQUEST_INVALID_PARAMETER);
	});

	test("throws ServerError when provider is not in config", async () => {
		const app = createTestApp();
		const err = await ResponsesContext.create(app, {
			model: "openai/gpt-4",
			input: "hi",
		}).catch((e) => e);
		expect(err instanceof ServerError).toBe(true);
		expect((err as ServerError).code).toBe(SERVER_REQUEST_INVALID_PARAMETER);
		expect((err as ServerError).message).toInclude("Unknown provider");
	});

	test("throws ServerError when provider is not registered", async () => {
		const registrar = new Registrar();
		const app = new ApplicationContext(config, registrar);
		const err = await ResponsesContext.create(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
		}).catch((e) => e);
		expect(err instanceof ServerError).toBe(true);
		expect((err as ServerError).code).toBe(SERVER_PROVIDER_NOT_REGISTERED);
		expect((err as ServerError).message).toInclude(
			"Provider is not registered",
		);
	});

	test("resolves session chain when previous_response_id is set", async () => {
		const app = createTestApp();
		const responseId = "resp_prev";
		const now = Math.floor(Date.now() / 1000);

		await app.sessionStore.save({
			id: responseId,
			created_at: now,
			status: "completed",
			request: { input: "hello" },
			response: { id: responseId, output: [] },
		} as StoredResponseSession);

		const ctx = await ResponsesContext.create(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
			previous_response_id: responseId,
		});

		expect(ctx.session).not.toBeNull();
		expect(ctx.session?.previous_response_id).toBe(responseId);
		expect(ctx.session?.turns).toHaveLength(1);
		expect(ctx.session?.turns[0]?.id).toBe(responseId);
	});

	test("throws SessionError when previous_response_id chain not found", async () => {
		const app = createTestApp();
		const err = await ResponsesContext.create(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
			previous_response_id: "resp_missing",
		}).catch((e) => e);
		expect(err instanceof SessionError).toBe(true);
		expect((err as SessionError).code).toBe(SESSION_CHAIN_NOT_FOUND);
	});

	test("null previous_response_id still works", async () => {
		const app = createTestApp();
		const ctx = await ResponsesContext.create(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
			previous_response_id: undefined,
		});

		expect(ctx.session).toBeNull();
	});
});
