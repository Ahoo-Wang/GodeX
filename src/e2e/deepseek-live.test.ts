import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import {
	DEFAULT_DEEPSEEK_BASE_URL,
	DeepSeekProvider,
} from "../providers/deepseek/provider";
import { Registrar } from "../providers/registrar";
import { createBuiltinRoutes, startServer } from "../server";
import { getLoopbackPort } from "./ports";

const apiKey = process.env.DEEPSEEK_API_KEY;
const liveEnabled = process.env.DEEPSEEK_LIVE_TESTS === "1";
const liveDescribe = apiKey && liveEnabled ? describe : describe.skip;
const deepSeekBaseUrl =
	process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL;
const liveModel = process.env.DEEPSEEK_LIVE_MODEL ?? "deepseek-v4-flash";

let godexServer: ReturnType<typeof Bun.serve> | null = null;
let godexBase = "";

function createLiveConfig(port: number): GodeXConfig {
	return {
		server: { port, host: "127.0.0.1" },
		default_provider: "deepseek",
		models: {
			aliases: {
				"gpt-5": `deepseek/${liveModel}`,
			},
		},
		providers: {
			deepseek: {
				api_key: apiKey ?? "",
				base_url: deepSeekBaseUrl,
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
	registrar.registerFactory(
		"deepseek",
		() => new DeepSeekProvider(deepSeekBaseUrl, apiKey, 120_000),
	);

	const app = new ApplicationContext(config, registrar);

	godexServer = startServer({
		config,
		configPath: "deepseek-live-test",
		logger: app.logger,
		routes: createBuiltinRoutes(app),
	});
	godexBase = `http://127.0.0.1:${godexServer.port}`;
});

afterAll(() => {
	godexServer?.stop();
});

async function postResponses(body: Record<string, unknown>): Promise<Response> {
	return fetch(`${godexBase}/v1/responses`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

liveDescribe("DeepSeek live e2e", () => {
	test("returns a non-stream response through GodeX", async () => {
		const res = await postResponses({
			model: "gpt-5",
			input: "Reply with exactly: ok",
			max_output_tokens: 16,
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
