import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import { Registrar } from "../providers/registrar";
import {
	createXiaomiProvider,
	DEFAULT_XIAOMI_BASE_URL,
} from "../providers/xiaomi";
import { createBuiltinRoutes, startServer } from "../server";
import { type GodeXClient, godexClient } from "./godex-client";
import { getLoopbackPort } from "./ports";

const apiKey = process.env.MIMO_API_KEY;
const liveEnabled = process.env.XIAOMI_LIVE_TESTS === "1";
const liveDescribe = apiKey && liveEnabled ? describe : describe.skip;
const xiaomiBaseUrl = process.env.XIAOMI_BASE_URL ?? DEFAULT_XIAOMI_BASE_URL;
const liveModel = process.env.XIAOMI_LIVE_MODEL ?? "mimo-v2.5-pro";

let godexServer: ReturnType<typeof Bun.serve> | null = null;
let client: GodeXClient;

function createLiveConfig(port: number): GodeXConfig {
	return {
		server: { port, host: "127.0.0.1" },
		default_provider: "xiaomi",
		models: {
			aliases: {
				"gpt-5": `xiaomi/${liveModel}`,
			},
		},
		providers: {
			xiaomi: {
				spec: "xiaomi",
				credentials: { api_key: apiKey ?? "" },
				endpoint: { base_url: xiaomiBaseUrl },
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
	registrar.registerFactory("xiaomi", () =>
		createXiaomiProvider({
			spec: "xiaomi",
			credentials: { api_key: apiKey },
			endpoint: { base_url: xiaomiBaseUrl },
			timeout_ms: 120_000,
		}),
	);

	const app = new ApplicationContext(config, registrar);

	godexServer = startServer({
		config,
		configPath: "xiaomi-live-test",
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

liveDescribe("Xiaomi live e2e", () => {
	test("returns a non-stream response through GodeX", async () => {
		const res = await postResponses({
			model: "gpt-5",
			input: "Reply with exactly: ok",
			tool_choice: "none",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			status: string;
			output_text?: string;
		};
		expect(body.status).toBe("completed");
		expect(typeof body.output_text).toBe("string");
		expect(body.output_text?.length ?? 0).toBeGreaterThan(0);
	}, 120_000);
});
