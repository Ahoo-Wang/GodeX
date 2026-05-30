import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import { createBuiltinRegistrar } from "../providers";
import { createBuiltinRoutes, startServer } from "../server";
import { type GodeXClient, godexClient } from "./godex-client";
import { getLoopbackPort } from "./ports";

let mockServer: ReturnType<typeof Bun.serve> | null = null;
let godexServer: ReturnType<typeof Bun.serve> | null = null;
let client: GodeXClient;
let mockUpstreamBase = "";
const upstreamRequests: Record<string, unknown>[] = [];

async function startMockUpstream() {
	const port = await getLoopbackPort();
	mockServer = Bun.serve({
		hostname: "127.0.0.1",
		port,
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === "/chat/completions" && req.method === "POST") {
				const body = (await req.json()) as Record<string, unknown>;
				upstreamRequests.push(body);
				return handleMockChat(body);
			}
			return new Response("not found", { status: 404 });
		},
	});
	mockUpstreamBase = `http://127.0.0.1:${mockServer.port}`;
}

function handleMockChat(_body: Record<string, unknown>) {
	return jsonResponse({
		id: "minimax-mock-chat",
		created: Math.floor(Date.now() / 1000),
		model: "MiniMax-M2.7",
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				message: {
					role: "assistant",
					content: "Hello from MiniMax mock!",
				},
			},
		],
		usage: {
			prompt_tokens: 10,
			completion_tokens: 5,
			total_tokens: 15,
			total_characters: 0,
			prompt_tokens_details: { cached_tokens: 3 },
		},
	});
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json" },
	});
}

beforeAll(async () => {
	await startMockUpstream();

	const config: GodeXConfig = {
		server: { port: await getLoopbackPort(), host: "127.0.0.1" },
		default_provider: "minimax",
		models: { aliases: {} },
		providers: {
			minimax: {
				spec: "minimax",
				credentials: { api_key: "test-key" },
				endpoint: { base_url: mockUpstreamBase },
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

	const app = new ApplicationContext(config, createBuiltinRegistrar());

	godexServer = startServer({
		config,
		configPath: "minimax-e2e-test",
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
	mockServer?.stop();
});

async function postResponses(body: Record<string, unknown>): Promise<Response> {
	return client.responses.createRaw(body as unknown as ResponseCreateRequest);
}

function resetUpstreamRequests(): void {
	upstreamRequests.length = 0;
}

function lastUpstreamRequest(): Record<string, unknown> {
	const request = upstreamRequests.at(-1);
	expect(request).toBeDefined();
	return request as Record<string, unknown>;
}

describe("MiniMax mocked e2e", () => {
	test("maps default request and strips reasoning_effort", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "MiniMax-M2.7",
			input: "Hello!",
			reasoning: { effort: "medium" },
		});

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).toMatchObject({
			model: "MiniMax-M2.7",
			messages: [{ role: "user", content: "Hello!" }],
		});
		expect(lastUpstreamRequest()).not.toHaveProperty("reasoning_effort");
	});

	test("returns MiniMax usage with prompt_tokens_details", async () => {
		resetUpstreamRequests();
		const res = await postResponses({ model: "MiniMax-M2.7", input: "Hi" });
		const body = (await res.json()) as {
			usage: {
				input_tokens: number;
				output_tokens: number;
				input_tokens_details: { cached_tokens: number };
			};
		};

		expect(res.status).toBe(200);
		expect(body.usage).toMatchObject({
			input_tokens: 10,
			output_tokens: 5,
			input_tokens_details: { cached_tokens: 3 },
		});
	});
});
