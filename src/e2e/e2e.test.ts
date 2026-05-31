// src/e2e/e2e.test.ts
//
// End-to-end tests for the full GodeX proxy pipeline.
//
// A mock Zhipu upstream server is started alongside the GodeX server so no
// real API key is required.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import type {
	ResponseCreateRequest,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import { Registrar } from "../providers/registrar";
import { createZhipuProvider } from "../providers/zhipu";
import { createBuiltinRoutes, startServer } from "../server";
import {
	collectGodexStreamEvents,
	type GodeXClient,
	godexClient,
} from "./godex-client";
import { getLoopbackPort } from "./ports";

// ---------------------------------------------------------------------------
// Mock upstream Zhipu server
// ---------------------------------------------------------------------------

let mockServer: ReturnType<typeof Bun.serve> | null = null;
let godexServer: ReturnType<typeof Bun.serve> | null = null;
let godexBase = "";
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
				const stream = body.stream as boolean | undefined;
				const _model = body.model as string;

				if (stream) {
					return handleMockStream(body);
				}

				return handleMockChat(body);
			}
			return new Response("not found", { status: 404 });
		},
	});
	mockUpstreamBase = `http://127.0.0.1:${mockServer.port}`;
}

function handleMockChat(body: Record<string, unknown>) {
	if (lastUserMessageContent(body) === "List workspace.") {
		return new Response(
			JSON.stringify({
				id: "mock-task-id",
				created: Math.floor(Date.now() / 1000),
				model: "glm-5.1",
				choices: [
					{
						index: 0,
						finish_reason: "tool_calls",
						message: {
							role: "assistant",
							content: null,
							tool_calls: [
								{
									id: "call_workspace_list",
									type: "function",
									function: {
										name: "workspace__list-files",
										arguments: "{}",
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
				},
			}),
			{ headers: { "Content-Type": "application/json" } },
		);
	}

	if (lastUserMessageContent(body) === "Please inspect cwd.") {
		return new Response(
			JSON.stringify({
				id: "mock-task-id",
				created: Math.floor(Date.now() / 1000),
				model: "glm-5.1",
				choices: [
					{
						index: 0,
						finish_reason: "tool_calls",
						message: {
							role: "assistant",
							content: null,
							tool_calls: [
								{
									id: "call_local_shell",
									type: "function",
									function: {
										name: "local_shell",
										arguments:
											'{"command":["pwd"],"env":{},"working_directory":"/tmp"}',
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
				},
			}),
			{ headers: { "Content-Type": "application/json" } },
		);
	}

	return new Response(
		JSON.stringify({
			id: "mock-task-id",
			created: Math.floor(Date.now() / 1000),
			model: "glm-5.1",
			choices: [
				{
					index: 0,
					finish_reason: "stop",
					message: {
						role: "assistant",
						content: "Hello from mock!",
					},
				},
			],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
			},
		}),
		{ headers: { "Content-Type": "application/json" } },
	);
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

function handleMockStream(body: Record<string, unknown>) {
	const taskId = "mock-stream-task";
	const created = Math.floor(Date.now() / 1000);

	const chunks =
		lastUserMessageContent(body) === "Stream inspect cwd."
			? [
					{
						choices: [
							{
								index: 0,
								delta: {
									role: "assistant",
									tool_calls: [
										{
											index: 0,
											type: "function",
											function: {
												name: "local_shell",
												arguments: '{"command"',
											},
										},
									],
								},
								finish_reason: null,
							},
						],
					},
					{
						choices: [
							{
								index: 0,
								delta: {
									tool_calls: [
										{
											index: 0,
											id: "call_stream_shell",
											function: { arguments: ':["pwd"],"env":{}' },
										},
									],
								},
								finish_reason: null,
							},
						],
					},
					{
						choices: [
							{
								index: 0,
								delta: {
									tool_calls: [
										{
											index: 0,
											function: { arguments: ',"working_directory":"/tmp"}' },
										},
									],
								},
								finish_reason: null,
							},
						],
					},
					{ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
				]
			: lastUserMessageContent(body) === "Stream two tools."
				? [
						{
							choices: [
								{
									index: 0,
									delta: {
										role: "assistant",
										tool_calls: [
											{
												index: 0,
												id: "call_weather",
												type: "function",
												function: {
													name: "get_weather",
													arguments: '{"city"',
												},
											},
											{
												index: 1,
												id: "call_time",
												type: "function",
												function: {
													name: "get_time",
													arguments: '{"zone"',
												},
											},
										],
									},
									finish_reason: null,
								},
							],
						},
						{
							choices: [
								{
									index: 0,
									delta: {
										tool_calls: [
											{
												index: 0,
												function: { arguments: ':"Paris"}' },
											},
											{
												index: 1,
												function: { arguments: ':"UTC"}' },
											},
										],
									},
									finish_reason: null,
								},
							],
						},
						{
							choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
						},
					]
				: [
						{
							choices: [
								{
									index: 0,
									delta: { role: "assistant", content: "Hello" },
									finish_reason: null,
								},
							],
						},
						{
							choices: [
								{ index: 0, delta: { content: " from" }, finish_reason: null },
							],
						},
						{
							choices: [
								{ index: 0, delta: { content: " mock!" }, finish_reason: null },
							],
						},
						{ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
					];

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ id: taskId, created, model: "glm-5.1", choices: chunk.choices })}\n\n`,
					),
				);
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
		},
	});
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
	await startMockUpstream();

	const config: GodeXConfig = {
		server: { port: await getLoopbackPort(), host: "127.0.0.1" },
		default_provider: "zhipu",
		models: { aliases: { "gpt-5": "zhipu/glm-5.1" } },
		providers: {
			zhipu: {
				spec: "zhipu",
				credentials: { api_key: "test-key" },
				endpoint: { base_url: mockUpstreamBase },
			},
			unregistered: {
				spec: "unregistered",
				credentials: { api_key: "test-key" },
				endpoint: { base_url: "http://127.0.0.1:1" },
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

	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () =>
		createZhipuProvider({
			spec: "zhipu",
			credentials: { api_key: "test-key" },
			endpoint: { base_url: mockUpstreamBase },
		}),
	);

	const app = new ApplicationContext(config, registrar);

	godexServer = startServer({
		config,
		configPath: "e2e-test",
		logger: app.logger,
		routes: createBuiltinRoutes(app),
	});
	godexBase = `http://127.0.0.1:${godexServer.port}`;
	client = godexClient({ baseURL: godexBase, apiKey: "test-key" });
});

afterAll(() => {
	godexServer?.stop();
	mockServer?.stop();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postResponses(body: Record<string, unknown>): Promise<Response> {
	return client.responses.createRaw(body as unknown as ResponseCreateRequest);
}

async function streamResponses(
	body: Record<string, unknown>,
): Promise<ResponseStreamEvent[]> {
	const stream = await client.responses.stream(
		body as unknown as ResponseCreateRequest,
	);
	return collectGodexStreamEvents(stream);
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
	tool_call_id?: string;
	tool_calls?: unknown[];
}> {
	const messages = lastUpstreamRequest().messages;
	expect(Array.isArray(messages)).toBe(true);
	return messages as Array<{
		role: string;
		content?: string;
		tool_call_id?: string;
		tool_calls?: unknown[];
	}>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E2E: health check", () => {
	test("GET /health returns ok", async () => {
		const body = await client.health.get();
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("number");
	});
});

describe("E2E: models list", () => {
	test("GET /v1/models returns configured models", async () => {
		const body = await client.models.list();
		expect(body.object).toBe("list");
		expect(body.data.length).toBeGreaterThan(0);
		expect(body.data.some((m) => m.id === "gpt-5")).toBe(true);
	});
});

describe("E2E: sync response", () => {
	test("returns a valid ResponseObject", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Hello!",
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.object).toBe("response");
		expect(body.status).toBe("completed");
		expect(body.id).toMatch(/^resp_/);
		expect(body.model).toBe("glm-5.1");
		expect(typeof body.created_at).toBe("number");
		expect(typeof body.completed_at).toBe("number");

		const output = body.output as {
			type: string;
			content?: { type: string; text: string }[];
		}[];
		expect(output.length).toBeGreaterThan(0);

		const msg = output.find((o) => o.type === "message");
		expect(msg).toBeDefined();
		expect(msg?.content?.some((c) => c.text === "Hello from mock!")).toBe(true);

		const usage = body.usage as {
			input_tokens: number;
			output_tokens: number;
			total_tokens: number;
		};
		expect(usage.input_tokens).toBe(10);
		expect(usage.output_tokens).toBe(5);

		const upstream = lastUpstreamRequest();
		expect(upstream.model).toBe("glm-5.1");
		expect(upstream.messages).toEqual([{ role: "user", content: "Hello!" }]);
	});

	test("maps reasoning and safety identifiers to Zhipu upstream fields", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Think carefully.",
			reasoning: { effort: "medium" },
			safety_identifier: "safe-123",
			user: "legacy-user",
		});

		expect(res.status).toBe(200);
		const upstream = lastUpstreamRequest();
		expect(upstream).toMatchObject({
			thinking: { type: "enabled" },
			user_id: "safe-123",
		});
		expect(upstream).not.toHaveProperty("reasoning_effort");
	});

	test("rejects missing model", async () => {
		const res = await postResponses({ input: "hi" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe("server.request.missing_model");
	});

	test("rejects invalid JSON", async () => {
		const res = await fetch(`${godexBase}/v1/responses`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "not-json",
		});
		expect(res.status).toBe(400);
	});

	test("rejects unknown provider", async () => {
		const res = await postResponses({
			model: "unknown/model",
			input: "hi",
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("server.request.invalid_parameter");
	});

	test("rejects configured providers without registered provider implementation", async () => {
		const res = await postResponses({
			model: "unregistered/model",
			input: "hi",
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe("server.provider.not_registered");
		expect(body.error.message).toContain("Provider is not registered");
	});

	test("ignores unsupported Responses parameters and still calls upstream", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "hi",
			background: true,
		});

		expect(res.status).toBe(200);
		expect(upstreamRequests).toHaveLength(1);
		expect(lastUpstreamRequest()).not.toHaveProperty("background");
	});

	test("gracefully skips unsupported tools and still calls upstream", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "hi",
			tools: [
				{
					type: "code_interpreter",
					container: { type: "auto" },
				},
			],
		});

		expect(res.status).toBe(200);
		expect(upstreamRequests).toHaveLength(1);
	});

	test("downgrades truncation auto and still calls upstream", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "hi",
			truncation: "auto",
		});

		expect(res.status).toBe(200);
		expect(upstreamRequests).toHaveLength(1);
		expect(lastUpstreamRequest()).not.toHaveProperty("truncation");
	});

	test("does not send OpenAI parallel_tool_calls as Zhipu tool_stream", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "hi",
			parallel_tool_calls: true,
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { parallel_tool_calls?: boolean };
		expect(body.parallel_tool_calls).toBe(true);
		expect(upstreamRequests).toHaveLength(1);
		expect(lastUpstreamRequest()).not.toHaveProperty("tool_stream");
	});

	test("maps Responses message arrays and structured output format", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: [
				{ role: "system", content: "Return JSON only." },
				{
					role: "user",
					content: [{ type: "input_text", text: "Jane, 54 years old" }],
				},
			],
			text: {
				format: {
					type: "json_schema",
					name: "person",
					schema: {
						type: "object",
						properties: { name: { type: "string" }, age: { type: "number" } },
						required: ["name", "age"],
						additionalProperties: false,
					},
				},
			},
		});
		expect(res.status).toBe(200);

		const upstream = lastUpstreamRequest();
		const messages = upstreamMessages();
		expect(messages).toEqual([
			{ role: "system", content: "Return JSON only." },
			{
				role: "user",
				content: expect.stringContaining(
					"Jane, 54 years old\n\nSchema name: person",
				),
			},
		]);
		expect(messages[1]?.content).toEqual(
			expect.stringContaining('"required":["name","age"]'),
		);
		expect(upstream.response_format).toEqual({ type: "json_object" });
	});

	test("rejects invalid strict json_schema output after json_object downgrade", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Return a strict JSON object.",
			text: {
				format: {
					type: "json_schema",
					name: "payload",
					schema: { type: "object" },
					strict: true,
				},
			},
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe("bridge.response.invalid_output_format");
		expect(body.error.message).toContain("not valid JSON");
		expect(lastUpstreamRequest().response_format).toEqual({
			type: "json_object",
		});
	});

	test("maps Responses function call items and text-array tool output", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: [
				{
					type: "function_call",
					call_id: "call_weather",
					name: "get_weather",
					arguments: '{"city":"Beijing"}',
				},
				{
					type: "function_call_output",
					call_id: "call_weather",
					output: [{ type: "input_text", text: '{"temperature":21}' }],
				},
				{ role: "user", content: "Summarize the tool result." },
			],
		});
		expect(res.status).toBe(200);
		expect(upstreamMessages()).toEqual([
			{
				role: "assistant",
				content: "",
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
			{
				role: "tool",
				content: '{"temperature":21}',
				tool_call_id: "call_weather",
			},
			{ role: "user", content: "Summarize the tool result." },
		]);
	});

	test("accepts Codex-style tools and tool history with graceful downgrades", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			include: ["message.output_text.logprobs"],
			max_tool_calls: 3,
			stream_options: { include_obfuscation: true },
			top_logprobs: 2,
			text: { verbosity: "low" },
			tool_choice: "required",
			tools: [
				{ type: "local_shell" },
				{ type: "apply_patch" },
				{ type: "custom", name: "read-file", description: "Read a file" },
				{
					type: "namespace",
					name: "workspace",
					description: "Workspace tools",
					tools: [
						{
							type: "function",
							name: "list-files",
							description: "List files",
							parameters: { type: "object" },
						},
					],
				},
			],
			input: [
				{
					type: "shell_call",
					call_id: "call_shell",
					action: { commands: ["pwd"] },
					status: "completed",
				},
				{
					type: "shell_call_output",
					call_id: "call_shell",
					output: [
						{
							stdout: "/tmp/project\n",
							stderr: "",
							outcome: { type: "exit", exit_code: 0 },
						},
					],
				},
				{ role: "user", content: "What changed?" },
			],
		});

		expect(res.status).toBe(200);
		const upstream = lastUpstreamRequest();
		expect(upstream.tool_choice).toBe("auto");
		expect(upstream.tools).toMatchObject([
			{ type: "function", function: { name: "local_shell" } },
			{ type: "function", function: { name: "apply_patch" } },
			{ type: "function", function: { name: "read-file" } },
			{ type: "function", function: { name: "workspace__list-files" } },
		]);
		expect(upstreamMessages()).toEqual([
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_shell",
						type: "function",
						function: {
							name: "shell",
							arguments: '{"commands":["pwd"]}',
						},
					},
				],
			},
			{
				role: "tool",
				content: "[exit 0]\nstdout:\n/tmp/project\n\nstderr:\n",
				tool_call_id: "call_shell",
			},
			{ role: "user", content: "What changed?" },
		]);
	});

	test("treats tool_choice none as an explicit no-tools request", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Do not call tools.",
			tool_choice: "none",
			tools: [{ type: "local_shell" }, { type: "apply_patch" }],
		});

		expect(res.status).toBe(200);
		expect(lastUpstreamRequest()).not.toHaveProperty("tools");
		expect(lastUpstreamRequest()).not.toHaveProperty("tool_choice");
	});

	test("rejects explicit tool_choice when the selected tool cannot be declared", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Try to force an unavailable tool.",
			tools: [
				{
					type: "code_interpreter",
					container: { type: "auto" },
				},
			],
			tool_choice: { type: "code_interpreter" },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe("bridge.request.unsupported_parameter");
		expect(body.error.message).toContain("tool_choice");
		expect(upstreamRequests).toHaveLength(0);
	});

	test("restores downgraded upstream tool calls to Codex built-in output items", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Please inspect cwd.",
			tools: [{ type: "local_shell" }],
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		const output = body.output as Array<Record<string, unknown>>;
		expect(output).toEqual(
			expect.arrayContaining([
				{
					id: "call_local_shell",
					type: "local_shell_call",
					call_id: "call_local_shell",
					action: {
						type: "exec",
						command: ["pwd"],
						env: {},
						working_directory: "/tmp",
					},
					status: "in_progress",
				},
			]),
		);
		expect(lastUpstreamRequest().tools).toMatchObject([
			{ type: "function", function: { name: "local_shell" } },
		]);
	});
});

describe("E2E: stream response", () => {
	test("streams SSE events through the full lifecycle", async () => {
		resetUpstreamRequests();
		const events = await streamResponses({
			model: "gpt-5",
			input: "Hello!",
			stream: true,
		});

		expect(events.some((event) => event.type === "response.created")).toBe(
			true,
		);
		expect(events.some((event) => event.type === "response.in_progress")).toBe(
			true,
		);
		expect(events.some((event) => event.type === "response.completed")).toBe(
			true,
		);
		expect(lastUpstreamRequest().stream).toBe(true);
	});

	test("streams text deltas", async () => {
		const events = await streamResponses({
			model: "gpt-5",
			input: "Hello!",
			stream: true,
		});

		const deltas = events
			.filter((e) => e.type === "response.output_text.delta")
			.map((e) => e.delta as string);

		const fullText = deltas.join("");
		expect(fullText).toBe("Hello from mock!");

		const completed = events.find((e) => e.type === "response.completed") as
			| { response?: { output_text?: string; output?: unknown[] } }
			| undefined;
		expect(completed?.response?.output_text).toBe("Hello from mock!");
		expect(completed?.response?.output).toBeArray();
	});

	test("streams failed event for invalid strict json_schema output after downgrade", async () => {
		resetUpstreamRequests();
		const events = await streamResponses({
			model: "gpt-5",
			input: "Return a strict JSON object.",
			stream: true,
			text: {
				format: {
					type: "json_schema",
					name: "payload",
					schema: { type: "object" },
					strict: true,
				},
			},
		});

		expect(events.some((event) => event.type === "response.completed")).toBe(
			false,
		);
		const failed = events.find((event) => event.type === "response.failed") as
			| { response?: { status?: string; error?: { message?: string } } }
			| undefined;
		expect(failed?.response?.status).toBe("failed");
		expect(failed?.response?.error?.message).toContain(
			"bridge.response.invalid_output_format",
		);
		expect(lastUpstreamRequest().response_format).toEqual({
			type: "json_object",
		});
	});

	test("streams tool call deltas into restored Responses output items", async () => {
		resetUpstreamRequests();
		const events = await streamResponses({
			model: "gpt-5",
			input: "Stream inspect cwd.",
			stream: true,
			tools: [{ type: "local_shell" }],
		});

		const added = events.find(
			(event) => event.type === "response.output_item.added",
		);
		const argumentsDone = events.find(
			(event) => event.type === "response.function_call_arguments.done",
		);
		const itemDone = events.find(
			(event) => event.type === "response.output_item.done",
		);
		const completed = events.find(
			(event) => event.type === "response.completed",
		);
		const addedItemId =
			added?.item && "id" in added.item ? added.item.id : undefined;

		expect(addedItemId).toEqual(expect.stringMatching(/^fc_/));
		expect(added?.item).toMatchObject({
			id: addedItemId,
			type: "function_call",
		});
		expect(argumentsDone?.item_id).toBe(addedItemId);
		expect(itemDone?.item).toMatchObject({
			id: addedItemId,
			type: "local_shell_call",
			call_id: "call_stream_shell",
			action: {
				type: "exec",
				command: ["pwd"],
				env: {},
				working_directory: "/tmp",
			},
			status: "completed",
		});
		expect(completed?.response?.output).toEqual([
			expect.objectContaining({
				id: addedItemId,
				type: "local_shell_call",
				call_id: "call_stream_shell",
			}),
		]);
	});

	test("streams multiple upstream tool calls independently", async () => {
		resetUpstreamRequests();
		const events = await streamResponses({
			model: "gpt-5",
			input: "Stream two tools.",
			stream: true,
			tools: [
				{
					type: "function",
					name: "get_weather",
					description: "Get weather.",
					parameters: { type: "object" },
				},
				{
					type: "function",
					name: "get_time",
					description: "Get time.",
					parameters: { type: "object" },
				},
			],
		});

		const completed = events.find(
			(event) => event.type === "response.completed",
		);
		expect(completed?.response?.output).toEqual([
			expect.objectContaining({
				id: "call_weather",
				type: "function_call",
				call_id: "call_weather",
				name: "get_weather",
				arguments: '{"city":"Paris"}',
			}),
			expect.objectContaining({
				id: "call_time",
				type: "function_call",
				call_id: "call_time",
				name: "get_time",
				arguments: '{"zone":"UTC"}',
			}),
		]);
	});
});

describe("E2E: session chain via previous_response_id", () => {
	test("multi-turn sync with session persistence", async () => {
		resetUpstreamRequests();
		// Turn 1
		const res1 = await postResponses({
			model: "gpt-5",
			input: "What is the capital of France?",
			store: true,
		});
		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as { id: string; status: string };
		expect(body1.status).toBe("completed");
		const responseId1 = body1.id;

		// Turn 2: reference previous response
		const res2 = await postResponses({
			model: "gpt-5",
			input: "And its population?",
			previous_response_id: responseId1,
			store: true,
		});
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as { id: string; status: string };
		expect(body2.status).toBe("completed");
		expect(upstreamMessages()).toEqual([
			{ role: "user", content: "What is the capital of France?" },
			{ role: "assistant", content: "Hello from mock!" },
			{ role: "user", content: "And its population?" },
		]);
		expect(lastUpstreamRequest()).not.toHaveProperty("previous_response_id");
	});

	test("rejects nonexistent previous_response_id", async () => {
		const res = await postResponses({
			model: "gpt-5",
			input: "follow-up",
			previous_response_id: "resp_nonexistent",
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("session.chain.not_found");
	});

	test("rejects previous_response_id with conversation before session lookup", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "follow-up",
			previous_response_id: "resp_nonexistent",
			conversation: { id: "conv_1" },
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("server.request.invalid_parameter");
		expect(upstreamRequests).toHaveLength(0);
	});

	test("does not persist turns when store is false", async () => {
		const res1 = await postResponses({
			model: "gpt-5",
			input: "Do not store this turn.",
			store: false,
		});
		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as { id: string; store?: boolean };
		expect(body1.store).toBe(false);

		const res2 = await postResponses({
			model: "gpt-5",
			input: "Try to continue.",
			previous_response_id: body1.id,
		});
		expect(res2.status).toBe(400);
		const body2 = (await res2.json()) as { error: { code: string } };
		expect(body2.error.code).toBe("session.chain.not_found");
	});

	test("stream turn can be referenced in next sync turn", async () => {
		resetUpstreamRequests();
		// Turn 1: streaming
		const events1 = await streamResponses({
			model: "gpt-5",
			input: "Stream question",
			stream: true,
			store: true,
		});
		const completedEvent = events1.find((e) => e.type === "response.completed");
		const responseId1 = completedEvent?.response?.id;
		expect(responseId1).toMatch(/^resp_/);

		// Turn 2: sync, referencing the streamed turn
		const res2 = await postResponses({
			model: "gpt-5",
			input: "Follow-up question",
			previous_response_id: responseId1,
		});
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as { id: string; status: string };
		expect(body2.status).toBe("completed");
		expect(upstreamMessages()).toEqual([
			{ role: "user", content: "Stream question" },
			{ role: "assistant", content: "Hello from mock!" },
			{ role: "user", content: "Follow-up question" },
		]);
	});

	test("replays streamed parallel tool calls as one assistant message", async () => {
		resetUpstreamRequests();
		const tools = [
			{
				type: "function",
				name: "get_weather",
				description: "Get weather.",
				parameters: { type: "object" },
				strict: true,
			},
			{
				type: "function",
				name: "get_time",
				description: "Get time.",
				parameters: { type: "object" },
				strict: true,
			},
		];
		const events1 = await streamResponses({
			model: "gpt-5",
			input: "Stream two tools.",
			stream: true,
			store: true,
			tools,
		});
		const responseId1 = events1.find((e) => e.type === "response.completed")
			?.response?.id;
		expect(responseId1).toMatch(/^resp_/);

		resetUpstreamRequests();
		const res2 = await postResponses({
			model: "gpt-5",
			previous_response_id: responseId1,
			input: [
				{
					type: "function_call_output",
					call_id: "call_weather",
					output: "Sunny.",
				},
				{
					type: "function_call_output",
					call_id: "call_time",
					output: "12:00 UTC.",
				},
				{ role: "user", content: "Summarize tool results." },
			],
			tools,
		});

		expect(res2.status).toBe(200);
		expect(upstreamMessages()).toEqual([
			{ role: "user", content: "Stream two tools." },
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_weather",
						type: "function",
						function: { name: "get_weather", arguments: '{"city":"Paris"}' },
					},
					{
						id: "call_time",
						type: "function",
						function: { name: "get_time", arguments: '{"zone":"UTC"}' },
					},
				],
			},
			{ role: "tool", content: "Sunny.", tool_call_id: "call_weather" },
			{ role: "tool", content: "12:00 UTC.", tool_call_id: "call_time" },
			{ role: "user", content: "Summarize tool results." },
		]);
	});

	test("replays namespace tool calls with provider names", async () => {
		resetUpstreamRequests();
		const tools = [
			{
				type: "namespace",
				name: "workspace",
				description: "Workspace tools",
				tools: [
					{
						type: "function",
						name: "list-files",
						description: "List files",
						parameters: { type: "object" },
					},
				],
			},
		];

		const res1 = await postResponses({
			model: "gpt-5",
			input: "List workspace.",
			tools,
			store: true,
		});
		expect(res1.status).toBe(200);
		const body1 = (await res1.json()) as { id: string };

		const res2 = await postResponses({
			model: "gpt-5",
			previous_response_id: body1.id,
			input: [
				{
					type: "function_call_output",
					call_id: "call_workspace_list",
					output: "src\nREADME.md",
				},
				{ role: "user", content: "Summarize listing." },
			],
			tools,
		});

		expect(res2.status).toBe(200);
		expect(upstreamMessages()).toEqual([
			{ role: "user", content: "List workspace." },
			{
				role: "assistant",
				content: "",
				tool_calls: [
					{
						id: "call_workspace_list",
						type: "function",
						function: { name: "workspace__list-files", arguments: "{}" },
					},
				],
			},
			{
				role: "tool",
				content: "src\nREADME.md",
				tool_call_id: "call_workspace_list",
			},
			{ role: "user", content: "Summarize listing." },
		]);
	});
});

describe("E2E: instructions mapping", () => {
	test("passes instructions as system message to upstream", async () => {
		resetUpstreamRequests();
		const res = await postResponses({
			model: "gpt-5",
			input: "Hello!",
			instructions: "You are a helpful assistant.",
		});
		expect(res.status).toBe(200);
		expect(upstreamMessages()).toEqual([
			{ role: "system", content: "You are a helpful assistant." },
			{ role: "user", content: "Hello!" },
		]);
	});
});
