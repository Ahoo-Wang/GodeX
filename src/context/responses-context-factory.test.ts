import { describe, expect, test } from "bun:test";
import {
	SERVER_PROVIDER_NOT_REGISTERED,
	SERVER_REQUEST_INVALID_PARAMETER,
	SERVER_REQUEST_MISSING_MODEL,
	ServerError,
} from "../error";
import type {
	ResponseSessionSnapshot,
	ResponseSessionStore,
	StoredResponseSession,
} from "../session";
import { ApplicationContext } from "./application-context";
import { createResponsesContext } from "./responses-context-factory";
import {
	baseConfig,
	type CapturedLog,
	createCapturingLogger,
	createRegistrar,
} from "./test-fixtures";

const completedTurn = {
	id: "resp_parent",
	previous_response_id: null,
	created_at: 1_764_000_000,
	completed_at: 1_764_000_001,
	status: "completed",
	request: {
		input: "Hello",
		model: "glm-5.1",
	},
	response: {
		id: "resp_parent",
		output: [],
	},
} satisfies StoredResponseSession;

const snapshot = {
	previous_response_id: "resp_parent",
	turns: [completedTurn],
	input_items: [],
} satisfies ResponseSessionSnapshot;

function createApp(): ApplicationContext {
	return new ApplicationContext(baseConfig, createRegistrar());
}

function setSessionStore(
	app: ApplicationContext,
	resolveChain: ResponseSessionStore["resolveChain"],
): void {
	Object.defineProperty(app, "sessionStore", {
		value: {
			async get() {
				return null;
			},
			async save() {},
			resolveChain,
			async delete() {},
		} satisfies ResponseSessionStore,
	});
}

describe("createResponsesContext", () => {
	test("resolves provider-qualified model selectors", async () => {
		const logs: CapturedLog[] = [];
		const app = createApp();
		Object.defineProperty(app, "logger", {
			value: createCapturingLogger(logs),
		});

		const ctx = await createResponsesContext(app, {
			model: "deepseek/deepseek-chat",
			input: "hi",
		});

		expect(ctx.resolved).toEqual({
			provider: "deepseek",
			model: "deepseek-chat",
		});
		expect(ctx.provider.name).toBe("deepseek");
		expect(ctx.requestId).toMatch(/^req_/);
		expect(ctx.responseId).toMatch(/^resp_/);
		expect(logs).toContainEqual({
			level: "debug",
			event: "model.resolved",
			attr: {
				selector: "deepseek/deepseek-chat",
				provider: "deepseek",
				model: "deepseek-chat",
			},
		});
	});

	test("resolves bare model selectors through the default provider", async () => {
		const ctx = await createResponsesContext(createApp(), {
			model: "glm-5.1",
			input: "hi",
		});

		expect(ctx.resolved).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
		expect(ctx.provider.name).toBe("zhipu");
	});

	test("propagates missing model ServerError unchanged", async () => {
		await expect(
			createResponsesContext(createApp(), {
				input: "hi",
			} as never),
		).rejects.toMatchObject({
			name: "ServerError",
			code: SERVER_REQUEST_MISSING_MODEL,
			message: "Missing required field: model",
		});
	});

	test("wraps unexpected resolver failures as invalid parameters", async () => {
		const app = createApp();
		const cause = new TypeError("invalid selector object");
		Object.defineProperty(app, "resolver", {
			value: {
				resolve() {
					throw cause;
				},
			},
		});

		try {
			await createResponsesContext(app, {
				model: { selector: "zhipu/glm-5.1" },
				input: "hi",
			} as never);
			throw new Error("expected createResponsesContext to reject");
		} catch (err) {
			expect(err).toBeInstanceOf(ServerError);
			expect((err as ServerError).code).toBe(SERVER_REQUEST_INVALID_PARAMETER);
			expect((err as ServerError).message).toBe("invalid selector object");
			expect((err as ServerError).context).toEqual({
				model: "[object Object]",
			});
			expect((err as ServerError).cause).toBe(cause);
		}
	});

	test("rejects providers missing from config before registrar resolution", async () => {
		await expect(
			createResponsesContext(createApp(), {
				model: "anthropic/claude-sonnet-4",
				input: "hi",
			}),
		).rejects.toMatchObject({
			name: "ServerError",
			code: SERVER_REQUEST_INVALID_PARAMETER,
			message: "Unknown provider: anthropic",
			context: { provider: "anthropic" },
		});
	});

	test("wraps registrar failures as provider not registered", async () => {
		const app = new ApplicationContext(baseConfig, createRegistrar(["zhipu"]));

		await expect(
			createResponsesContext(app, {
				model: "deepseek/deepseek-chat",
				input: "hi",
			}),
		).rejects.toMatchObject({
			name: "ServerError",
			code: SERVER_PROVIDER_NOT_REGISTERED,
			message: "Provider is not registered: deepseek",
			context: { provider: "deepseek" },
		});
	});

	test("resolves previous_response_id into the returned context", async () => {
		const app = createApp();
		setSessionStore(app, async () => snapshot);

		const ctx = await createResponsesContext(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
			previous_response_id: "resp_parent",
		});

		expect(ctx.session).toBe(snapshot);
	});
});
