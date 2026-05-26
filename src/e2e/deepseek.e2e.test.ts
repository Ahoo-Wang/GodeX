import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import { createBuiltinRegistrar } from "../providers";
import { createBuiltinRoutes, startServer } from "../server";
import { getLoopbackPort } from "./ports";

let mockServer: ReturnType<typeof Bun.serve> | null = null;
let godexServer: ReturnType<typeof Bun.serve> | null = null;
let godexBase = "";
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

function handleMockChat(body: Record<string, unknown>) {
	const lastUser = lastUserMessageContent(body);
	if (lastUser === "Need weather.") {
		return jsonResponse({
			id: "deepseek-mock-tool",
			created: Math.floor(Date.now() / 1000),
			model: "deepseek-v4-flash",
			choices: [
				{
					index: 0,
					finish_reason: "tool_calls",
					message: {
						role: "assistant",
						content: "",
						reasoning_content: "Need tool.",
						tool_calls: [
							{
								id: "call_weather",
								type: "function",
								function: {
									name: "get_weather",
									arguments: '{"city":"Beijing"}',
								},
							},
						],
					},
				},
			],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
				prompt_cache_hit_tokens: 4,
				completion_tokens_details: { reasoning_tokens: 2 },
			},
		});
	}

	return jsonResponse({
		id: "deepseek-mock-chat",
		created: Math.floor(Date.now() / 1000),
		model: "deepseek-v4-flash",
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				message: {
					role: "assistant",
					content: "Hello from DeepSeek mock!",
				},
			},
		],
		usage: {
			prompt_tokens: 10,
			completion_tokens: 5,
			total_tokens: 15,
		},
	});
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json" },
	});
}

function lastUserMessageContent(body: Record<string, unknown>): unknown {
	const messages = body.messages;
	if (!Array.isArray(messages)) return undefined;

	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (
			message &&
			typeof message === "object" &&
			"role" in message &&
			message.role === "user" &&
			"content" in message
		) {
			return message.content;
		}
	}

	return undefined;
}

beforeAll(async () => {
	await startMockUpstream();

	const config: GodeXConfig = {
		server: { port: await getLoopbackPort(), host: "127.0.0.1" },
		default_provider: "deepseek",
		models: { aliases: { "gpt-5": "deepseek/deepseek-v4-flash" } },
		providers: {
			deepseek: {
				api_key: "test-key",
				base_url: mockUpstreamBase,
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
		configPath: "deepseek-e2e-test",
		logger: app.logger,
		routes: createBuiltinRoutes(app),
	});
	godexBase = `http://127.0.0.1:${godexServer.port}`;
});

afterAll(() => {
	godexServer?.stop();
	mockServer?.stop();
});

async function postResponses(body: Record<string, unknown>): Promise<Response> {
	return fetch(`${godexBase}/v1/responses`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function resetUpstreamRequests(): void {
	upstreamRequests.length = 0;
}

function lastUpstreamRequest(): Record<string, unknown> {
	const request = upstreamRequests.at(-1);
	expect(request).toBeDefined();
	return request as Record<string, unknown>;
}

function upstreamMessages(): Array<{
	role: string;
	content?: string;
	reasoning_content?: string;
	tool_calls?: unknown[];
}> {
	const messages = lastUpstreamRequest().messages;
	expect(Array.isArray(messages)).toBe(true);
	return messages as Array<{
		role: string;
		content?: string;
		reasoning_content?: string;
		tool_calls?: unknown[];
	}>;
}

describe("DeepSeek mocked e2e", () => {
	test("maps default request with thinking disabled", async () => {
		resetUpstreamRequests();
		const res = await postResponses({ model: "gpt-5", input: "Hello!" });

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).toMatchObject({
			model: "deepseek-v4-flash",
			thinking: { type: "disabled" },
			messages: [{ role: "user", content: "Hello!" }],
		});
	});

	test("maps explicit reasoning to thinking enabled", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Think carefully.",
			reasoning: { effort: "xhigh" },
		});

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).toMatchObject({
			thinking: { type: "enabled" },
			reasoning_effort: "max",
		});
	});

	test("replays reasoning content for previous tool-call turns", async () => {
		const first = await postResponses({
			model: "gpt-5",
			input: "Need weather.",
			store: true,
			reasoning: { effort: "high" },
			tools: [
				{
					type: "function",
					name: "get_weather",
					parameters: { type: "object" },
					strict: true,
				},
			],
		});
		const firstBody = (await first.json()) as { id: string };

		resetUpstreamRequests();
		const second = await postResponses({
			model: "gpt-5",
			previous_response_id: firstBody.id,
			input: [
				{
					type: "function_call_output",
					call_id: "call_weather",
					output: "sunny",
				},
			],
			reasoning: { effort: "high" },
			tools: [
				{
					type: "function",
					name: "get_weather",
					parameters: { type: "object" },
					strict: true,
				},
			],
		});

		expect(second.status).toBe(200);
		const assistant = upstreamMessages().find(
			(message) => message.role === "assistant" && message.tool_calls,
		);
		expect(assistant?.reasoning_content).toBe("Need tool.");
	});
});
