// src/e2e/zhipu-live.test.ts
//
// Optional live integration tests against Zhipu. These tests are skipped when
// ZHIPU_API_KEY is not set.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import type {
	ResponseCreateRequest,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import { Registrar } from "../providers/registrar";
import {
	createZhipuProvider,
	DEFAULT_ZHIPU_BASE_URL,
} from "../providers/zhipu";
import { createBuiltinRoutes, startServer } from "../server";
import {
	collectGodexStreamEvents,
	type GodeXClient,
	godexClient,
} from "./godex-client";
import { getLoopbackPort } from "./ports";

const apiKey = process.env.ZHIPU_API_KEY;
const liveEnabled = process.env.ZHIPU_LIVE_TESTS === "1";
const liveDescribe = apiKey && liveEnabled ? describe : describe.skip;
const zhipuBaseUrl = process.env.ZHIPU_BASE_URL ?? DEFAULT_ZHIPU_BASE_URL;
const liveModel = process.env.ZHIPU_TEST_MODEL ?? "gpt-5-mini";
const maxOutputTokens = Number(
	process.env.ZHIPU_TEST_MAX_OUTPUT_TOKENS ?? 1024,
);

let godexServer: ReturnType<typeof Bun.serve> | null = null;
let client: GodeXClient;

function createLiveConfig(port: number): GodeXConfig {
	return {
		server: { port, host: "127.0.0.1" },
		default_provider: "zhipu",
		models: {
			aliases: {
				"gpt-5": "zhipu/glm-5.1",
				"gpt-5-mini": "zhipu/glm-5-turbo",
				"gpt-4o-mini": "zhipu/glm-4.7-flash",
			},
		},
		providers: {
			zhipu: {
				spec: "zhipu",
				credentials: { api_key: apiKey ?? "" },
				endpoint: { base_url: zhipuBaseUrl },
			},
		},
		session: { backend: "memory" },
		logging: { level: "error" },
		trace: {
			enabled: false,
			path: "./data/trace.db",
			max_queue_size: 10000,
			flush_interval_ms: 1000,
			batch_size: 100,
			capture_payload: false,
			payload_max_bytes: 65536,
		},
	};
}

beforeAll(async () => {
	if (!apiKey || !liveEnabled) return;

	const config = createLiveConfig(await getLoopbackPort());
	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () =>
		createZhipuProvider({
			spec: "zhipu",
			credentials: { api_key: apiKey },
			endpoint: { base_url: zhipuBaseUrl },
			timeout_ms: 120_000,
		}),
	);

	const app = new ApplicationContext(config, registrar);

	godexServer = startServer({
		config,
		configPath: "e2e-test",
		logger: app.logger,
		routes: createBuiltinRoutes(app),
	});
	client = godexClient({
		baseURL: `http://127.0.0.1:${godexServer.port}`,
		apiKey: "test-key",
	});
});

afterAll(() => {
	godexServer?.stop();
});

async function postResponses(body: Record<string, unknown>): Promise<Response> {
	return client.responses.createRaw(body as unknown as ResponseCreateRequest);
}

async function collectResponseStreamEvents(
	body: Record<string, unknown>,
): Promise<ResponseStreamEvent[]> {
	const stream = await client.responses.stream(
		body as unknown as ResponseCreateRequest,
	);
	return collectGodexStreamEvents(stream);
}

liveDescribe("Live E2E: Zhipu bridge", () => {
	test("completes a synchronous Responses request", async () => {
		const res = await postResponses({
			model: liveModel,
			input:
				"Reply with one short sentence containing the token godex-live-sync.",
			temperature: 0,
			max_output_tokens: maxOutputTokens,
			tool_choice: "none",
			store: true,
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			id: string;
			model: string;
			status: string;
			output_text?: string;
			usage?: { total_tokens: number } | null;
		};
		expect(body.id).toMatch(/^resp_/);
		expect(body.model).toBeString();
		expect(body.status).toBe("completed");
		expect(body.output_text?.length ?? 0).toBeGreaterThan(0);
		expect(body.usage?.total_tokens ?? 0).toBeGreaterThan(0);
	}, 120_000);

	test("streams Responses-compatible lifecycle events", async () => {
		const events = await collectResponseStreamEvents({
			model: liveModel,
			input:
				"Reply with one short sentence containing the token godex-live-stream.",
			stream: true,
			temperature: 0,
			max_output_tokens: maxOutputTokens,
		});

		expect(events.some((event) => event.type === "response.created")).toBe(
			true,
		);
		expect(
			events.some((event) => event.type === "response.output_text.delta"),
		).toBe(true);
		const completed = events.find(
			(event) => event.type === "response.completed",
		) as { response?: { output_text?: string; status?: string } } | undefined;
		expect(completed?.response?.status).toBe("completed");
		expect(completed?.response?.output_text?.length ?? 0).toBeGreaterThan(0);
	}, 120_000);

	test("continues a stored response through previous_response_id", async () => {
		const first = await postResponses({
			model: liveModel,
			input: "Remember this token for the next turn: godex-live-session.",
			temperature: 0,
			max_output_tokens: maxOutputTokens,
			store: true,
		});
		expect(first.status).toBe(200);
		const firstBody = (await first.json()) as { id: string; status: string };
		expect(firstBody.status).toBe("completed");

		const second = await postResponses({
			model: liveModel,
			input: "Continue the prior turn in one short sentence.",
			previous_response_id: firstBody.id,
			temperature: 0,
			max_output_tokens: maxOutputTokens,
		});
		expect(second.status).toBe(200);
		const secondBody = (await second.json()) as {
			status: string;
			output_text?: string;
			previous_response_id?: string;
		};
		expect(secondBody.status).toBe("completed");
		expect(secondBody.previous_response_id).toBe(firstBody.id);
		expect(secondBody.output_text?.length ?? 0).toBeGreaterThan(0);
	}, 120_000);
});
