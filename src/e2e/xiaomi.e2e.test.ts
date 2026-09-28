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

function handleMockChat(body: Record<string, unknown>) {
	if (hasXiaomiWebSearchTool(body)) {
		return jsonResponse({
			id: "xiaomi-mock-web-search",
			created: Math.floor(Date.now() / 1000),
			model: "mimo-v2.5-pro",
			choices: [
				{
					index: 0,
					finish_reason: "stop",
					message: {
						role: "assistant",
						content: "Search-backed Xiaomi answer.",
						annotations: [
							{
								type: "url_citation",
								url: "https://news.example.com/search-result",
								title: "Search result",
								summary: "Search result summary.",
								site_name: "Example News",
								publish_time: "2026-05-30T12:00:00+08:00",
							},
						],
					},
				},
			],
			usage: {
				prompt_tokens: 30,
				completion_tokens: 12,
				total_tokens: 42,
				web_search_usage: { tool_usage: 1, page_usage: 1 },
			},
		});
	}

	if (lastUserMessageContent(body) === "List files.") {
		return jsonResponse({
			id: "xiaomi-mock-tools",
			created: Math.floor(Date.now() / 1000),
			model: "mimo-v2.5-pro",
			choices: [
				{
					index: 0,
					finish_reason: "tool_calls",
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_shell_1",
								type: "function",
								function: {
									name: "local_shell",
									arguments:
										'{"command":["ls"],"env":{},"working_directory":"/tmp"}',
								},
							},
						],
					},
				},
			],
			usage: {
				prompt_tokens: 20,
				completion_tokens: 10,
				total_tokens: 30,
			},
		});
	}

	return jsonResponse({
		id: "xiaomi-mock-chat",
		created: Math.floor(Date.now() / 1000),
		model: "mimo-v2.5-pro",
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				message: {
					role: "assistant",
					content: "Hello from Xiaomi mock!",
				},
			},
		],
		usage: {
			prompt_tokens: 10,
			completion_tokens: 5,
			total_tokens: 15,
			prompt_tokens_details: { cached_tokens: 3 },
			completion_tokens_details: { reasoning_tokens: 2 },
		},
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

function hasXiaomiWebSearchTool(body: Record<string, unknown>): boolean {
	const tools = body.tools;
	return (
		Array.isArray(tools) &&
		tools.some(
			(tool) =>
				typeof tool === "object" &&
				tool !== null &&
				"type" in tool &&
				tool.type === "web_search",
		)
	);
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
		default_provider: "xiaomi",
		models: { aliases: {} },
		providers: {
			xiaomi: {
				spec: "xiaomi",
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
		configPath: "xiaomi-e2e-test",
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

describe("Xiaomi mocked e2e", () => {
	test("maps boolean reasoning effort to thinking enabled and strips reasoning_effort", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "Hello!",
			reasoning: { effort: "medium" },
		});

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).toMatchObject({
			model: "mimo-v2.5-pro",
			messages: [{ role: "user", content: "Hello!" }],
			thinking: { type: "enabled" },
		});
		expect(lastUpstreamRequest()).not.toHaveProperty("reasoning_effort");
	});

	test("defaults thinking to disabled without reasoning", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "Hello!",
		});

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).toMatchObject({
			thinking: { type: "disabled" },
		});
	});

	test("maps reasoning effort none to thinking disabled", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "Hello!",
			reasoning: { effort: "none" },
		});

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).toMatchObject({
			thinking: { type: "disabled" },
		});
		expect(lastUpstreamRequest()).not.toHaveProperty("reasoning_effort");
	});

	test("maps max_tokens to max_completion_tokens", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "Hi",
			max_output_tokens: 1024,
		});

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).toMatchObject({
			max_completion_tokens: 1024,
		});
		expect(lastUpstreamRequest()).not.toHaveProperty("max_tokens");
	});

	test("returns Xiaomi usage with cached and reasoning tokens", async () => {
		resetUpstreamRequests();
		const res = await postResponses({ model: "mimo-v2.5-pro", input: "Hi" });
		const body = (await res.json()) as {
			usage: {
				input_tokens: number;
				output_tokens: number;
				input_tokens_details: { cached_tokens: number };
				output_tokens_details: { reasoning_tokens: number };
			};
		};

		expect(res.status).toBe(200);
		expect(body.usage).toMatchObject({
			input_tokens: 10,
			output_tokens: 5,
			input_tokens_details: { cached_tokens: 3 },
			output_tokens_details: { reasoning_tokens: 2 },
		});
	});

	test("returns function_call output from upstream tool_calls", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "List files.",
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			status: string;
			output: Array<Record<string, unknown>>;
		};
		expect(body.status).toBe("completed");

		const toolCall = body.output?.find((item) => item.type === "function_call");
		expect(toolCall).toMatchObject({
			type: "function_call",
			call_id: "call_shell_1",
			name: "local_shell",
			arguments: '{"command":["ls"],"env":{},"working_directory":"/tmp"}',
		});
	});

	test("restores degraded local_shell tool call back to local_shell_call", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "List files.",
			tools: [{ type: "local_shell" }],
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			output: Array<Record<string, unknown>>;
		};

		const shellCall = body.output?.find(
			(item) => item.type === "local_shell_call",
		);
		expect(shellCall).toMatchObject({
			type: "local_shell_call",
			call_id: "call_shell_1",
			action: {
				type: "exec",
				command: ["ls"],
				env: {},
				working_directory: "/tmp",
			},
		});
	});

	test("degrades Codex built-in tools to function type", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "List files.",
			tools: [
				{ type: "local_shell" },
				{ type: "apply_patch" },
				{
					type: "custom",
					name: "read-file",
					description: "Read a file",
				},
			],
		});

		expect(res.status).toBe(200);
		const upstream = lastUpstreamRequest();
		const tools = upstream.tools as Array<Record<string, unknown>>;

		expect(tools).toHaveLength(3);
		for (const tool of tools) {
			expect(tool.type).toBe("function");
			expect(tool).toHaveProperty("function");
		}
		expect(
			tools.map(
				(tool) => (tool.function as Record<string, unknown>).name as string,
			),
		).toEqual(["local_shell", "apply_patch", "read-file"]);
	});

	test("maps Responses web_search to Xiaomi native search and restores citations", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: "Search current Xiaomi news.",
			tools: [
				{
					type: "web_search",
					search_context_size: "high",
					user_location: {
						type: "approximate",
						country: "China",
						region: "Hubei",
						city: "Wuhan",
					},
				},
			],
		});

		expect(res.status).toBe(200);
		const upstream = lastUpstreamRequest();
		expect(upstream.tools).toEqual([
			{
				type: "web_search",
				max_keyword: 3,
				limit: 5,
				user_location: {
					type: "approximate",
					country: "China",
					region: "Hubei",
					city: "Wuhan",
				},
			},
		]);

		const body = (await res.json()) as {
			output_text: string;
			output: Array<Record<string, unknown>>;
		};
		expect(body.output_text).toBe("Search-backed Xiaomi answer.");
		expect(body.output[0]).toMatchObject({
			type: "web_search_call",
			status: "completed",
			action: {
				type: "search",
				sources: [
					{ type: "url", url: "https://news.example.com/search-result" },
				],
			},
		});
	});

	test("maps Responses function call history to upstream tool_calls messages", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "mimo-v2.5-pro",
			input: [
				{
					type: "function_call",
					call_id: "call_read",
					name: "read-file",
					arguments: '{"path":"test.ts"}',
				},
				{
					type: "function_call_output",
					call_id: "call_read",
					output: "file contents here",
				},
				{ role: "user", content: "Summarize the file." },
			],
		});

		expect(res.status).toBe(200);
		const messages = (lastUpstreamRequest().messages ?? []) as Array<
			Record<string, unknown>
		>;

		expect(messages).toEqual([
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_read",
						type: "function",
						function: {
							name: "read-file",
							arguments: '{"path":"test.ts"}',
						},
					},
				],
			},
			{
				role: "tool",
				content: "file contents here",
				tool_call_id: "call_read",
			},
			{ role: "user", content: "Summarize the file." },
		]);
	});
});
