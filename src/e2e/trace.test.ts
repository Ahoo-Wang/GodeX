import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const encoder = new TextEncoder();

let godexServer: ReturnType<typeof Bun.serve> | undefined;
let mockServer: ReturnType<typeof Bun.serve> | undefined;
let app: ApplicationContext | undefined;
let tempDir: string | undefined;
let client: GodeXClient | undefined;

interface TraceUsageRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	input_tokens: number | null;
	output_tokens: number | null;
	total_tokens: number | null;
	cached_tokens: number | null;
	cache_hit_ratio: number | null;
}

interface TraceRequestRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	stream: number;
	requested_prompt_cache_key: string | null;
	payload_hash: string | null;
	payload_bytes: number | null;
	payload_json: string | null;
	payload_truncated: number;
}

interface TraceErrorRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	event_name: string;
	error_type: string | null;
	domain: string | null;
	code: string;
	message: string;
	status: number | null;
	payload_json: string | null;
	payload_truncated: number;
}

afterEach(async () => {
	godexServer?.stop();
	mockServer?.stop();
	await app?.close();
	godexServer = undefined;
	mockServer = undefined;
	app = undefined;
	client = undefined;
	if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	tempDir = undefined;
});

describe("E2E: trace recording", () => {
	test("records provider-returned cache usage details from sync responses", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "godex-trace-provider-cache-e2e-"));
		const upstreamRequests: Record<string, unknown>[] = [];
		const mockBase = await startMockZhipu(upstreamRequests);
		const tracePath = join(tempDir, "trace.db");
		const godexBase = await startGodex(mockBase, tracePath);

		const res = await clientFor(godexBase).responses.create({
			model: "gpt-5",
			input: "Return cache usage details.",
		});

		const body = res as {
			usage?: {
				input_tokens: number;
				output_tokens: number;
				total_tokens: number;
				input_tokens_details?: { cached_tokens?: number };
			} | null;
		};
		expect(body.usage).toMatchObject({
			input_tokens: 120,
			output_tokens: 30,
			total_tokens: 150,
			input_tokens_details: { cached_tokens: 60 },
		});
		expect(upstreamRequests).toHaveLength(1);
		const [upstream] = upstreamRequests as [Record<string, unknown>];
		expect(upstream.stream).toBeUndefined();

		await app?.close();
		app = undefined;

		const db = new Database(tracePath, { readonly: true, strict: true });
		try {
			const requestRow = db
				.query("SELECT * FROM trace_requests")
				.get() as TraceRequestRow | null;
			const usageRow = db
				.query("SELECT * FROM trace_usage")
				.get() as TraceUsageRow | null;

			expect(requestRow).toMatchObject({
				provider: "zhipu",
				model: "glm-5.1",
				stream: 0,
				requested_prompt_cache_key: null,
			});
			expect(usageRow).toMatchObject({
				provider: "zhipu",
				model: "glm-5.1",
				input_tokens: 120,
				output_tokens: 30,
				total_tokens: 150,
				cached_tokens: 60,
				cache_hit_ratio: 0.5,
			});
		} finally {
			db.close();
		}
	});

	test("records streaming request diagnostics and usage rows in SQLite", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "godex-trace-e2e-"));
		const upstreamRequests: Record<string, unknown>[] = [];
		const mockBase = await startMockZhipu(upstreamRequests);
		const tracePath = join(tempDir, "trace.db");
		const godexBase = await startGodex(mockBase, tracePath);

		const events = await streamResponses(godexBase, {
			model: "gpt-5",
			stream: true,
			prompt_cache_key: "trace-e2e-cache",
			input: "Record trace usage from a streamed response.",
			tools: [
				{
					type: "function",
					name: "lookup_order",
					description: "Look up an order by id.",
					parameters: {
						type: "object",
						properties: { order_id: { type: "string" } },
						required: ["order_id"],
					},
					strict: false,
				},
				{ type: "web_search_preview", search_context_size: "low" },
			],
		});

		expect(events.some((event) => event.type === "response.completed")).toBe(
			true,
		);
		const completed = events.find(
			(event) => event.type === "response.completed",
		) as
			| {
					response?: {
						usage?: {
							input_tokens_details?: { cached_tokens?: number };
						} | null;
					};
			  }
			| undefined;
		expect(completed?.response?.usage).toMatchObject({
			input_tokens_details: { cached_tokens: 40 },
		});

		expect(upstreamRequests).toHaveLength(1);
		const [upstream] = upstreamRequests as [Record<string, unknown>];
		expect(upstream.stream).toBe(true);
		expect(upstream.stream_options).toEqual({ include_usage: true });
		expect(upstream).not.toHaveProperty("prompt_cache_key");

		await app?.close();
		app = undefined;

		const db = new Database(tracePath, { readonly: true, strict: true });
		try {
			const requestRow = db
				.query("SELECT * FROM trace_requests")
				.get() as TraceRequestRow | null;
			const usageRow = db
				.query("SELECT * FROM trace_usage")
				.get() as TraceUsageRow | null;
			const eventRows = db
				.query("SELECT event_name FROM trace_events ORDER BY id")
				.all() as { event_name: string }[];

			expect(requestRow).not.toBeNull();
			expect(usageRow).not.toBeNull();
			if (!requestRow || !usageRow) return;
			expect(requestRow).toMatchObject({
				provider: "zhipu",
				model: "glm-5.1",
				stream: 1,
				requested_prompt_cache_key: "trace-e2e-cache",
				payload_json: null,
				payload_truncated: 0,
			});
			expect(requestRow.request_id).toMatch(/^req_/);
			expect(requestRow.response_id).toMatch(/^resp_/);
			expect(requestRow.payload_hash).toEqual(expect.any(String));
			expect(requestRow.payload_bytes).toBeGreaterThan(0);

			expect(usageRow).toMatchObject({
				request_id: requestRow.request_id,
				response_id: requestRow.response_id,
				provider: "zhipu",
				model: "glm-5.1",
				input_tokens: 100,
				output_tokens: 25,
				total_tokens: 125,
				cached_tokens: 40,
				cache_hit_ratio: 0.4,
			});
			expect(eventRows.map((row) => row.event_name)).toContain(
				"provider.request.body",
			);
			expect(eventRows.map((row) => row.event_name)).toContain(
				"upstream.stream.event.raw",
			);
			expect(eventRows.map((row) => row.event_name)).toContain(
				"upstream.stream.event.transformed",
			);
		} finally {
			db.close();
		}
	});

	test("records provider errors in SQLite", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "godex-trace-error-e2e-"));
		const upstreamRequests: Record<string, unknown>[] = [];
		const mockBase = await startMockZhipu(upstreamRequests);
		const tracePath = join(tempDir, "trace.db");
		const godexBase = await startGodex(mockBase, tracePath);

		const res = await fetch(`${godexBase}/v1/responses`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer test-key",
			},
			body: JSON.stringify({
				model: "gpt-5",
				input: "Trigger upstream error.",
			}),
		});

		expect(res.status).toBe(422);
		expect(upstreamRequests).toHaveLength(1);

		await app?.close();
		app = undefined;

		const db = new Database(tracePath, { readonly: true, strict: true });
		try {
			const errorRow = db
				.query("SELECT * FROM trace_errors")
				.get() as TraceErrorRow | null;

			expect(errorRow).toMatchObject({
				provider: "zhipu",
				model: "glm-5.1",
				event_name: "responses.request.provider.error",
				error_type: "ProviderError",
				domain: "provider",
				code: "provider.upstream.error",
				message: "mock upstream rejected request",
				status: 502,
				payload_truncated: 0,
			});
			expect(errorRow?.payload_json).toBeNull();
			expect(errorRow?.request_id).toMatch(/^req_/);
			expect(errorRow?.response_id).toMatch(/^resp_/);
		} finally {
			db.close();
		}
	});
});

async function startMockZhipu(
	upstreamRequests: Record<string, unknown>[],
): Promise<string> {
	const port = await getLoopbackPort();
	mockServer = Bun.serve({
		hostname: "127.0.0.1",
		port,
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname !== "/chat/completions" || req.method !== "POST") {
				return new Response("not found", { status: 404 });
			}
			const body = (await req.json()) as Record<string, unknown>;
			upstreamRequests.push(body);
			if (JSON.stringify(body).includes("Trigger upstream error.")) {
				return Response.json(
					{
						error: {
							message: "mock upstream rejected request",
							type: "invalid_request_error",
							code: "invalid_request_error",
						},
					},
					{ status: 400, statusText: "Bad Request" },
				);
			}
			if (body.stream !== true) return handleMockChat();
			return handleMockStream();
		},
	});
	return `http://127.0.0.1:${mockServer.port}`;
}

async function startGodex(
	mockBase: string,
	tracePath: string,
): Promise<string> {
	const config: GodeXConfig = {
		server: { port: await getLoopbackPort(), host: "127.0.0.1" },
		default_provider: "zhipu",
		models: { aliases: { "gpt-5": "zhipu/glm-5.1" } },
		providers: {
			zhipu: {
				spec: "zhipu",
				credentials: { api_key: "test-key" },
				endpoint: { base_url: mockBase },
			},
		},
		session: { backend: "memory" },
		logging: { level: "error" },
		trace: {
			enabled: true,
			path: tracePath,
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
			endpoint: { base_url: mockBase },
		}),
	);
	app = new ApplicationContext(config, registrar);
	godexServer = startServer({
		config,
		configPath: "trace-e2e-test",
		logger: app.logger,
		routes: createBuiltinRoutes(app),
	});
	return `http://127.0.0.1:${godexServer.port}`;
}

function clientFor(godexBase: string): GodeXClient {
	client ??= godexClient({ baseURL: godexBase, apiKey: "test-key" });
	return client;
}

async function streamResponses(
	godexBase: string,
	body: Record<string, unknown>,
): Promise<ResponseStreamEvent[]> {
	const stream = await clientFor(godexBase).responses.stream(
		body as unknown as ResponseCreateRequest,
	);
	return collectGodexStreamEvents(stream);
}

function handleMockStream(): Response {
	const taskId = "mock-trace-stream-task";
	const created = Math.floor(Date.now() / 1000);
	const chunks = [
		{
			id: taskId,
			created,
			model: "glm-5.1",
			choices: [
				{
					index: 0,
					delta: { role: "assistant", content: "Trace recorded." },
					finish_reason: null,
				},
			],
		},
		{
			id: taskId,
			created,
			model: "glm-5.1",
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
		},
		{
			id: taskId,
			created,
			model: "glm-5.1",
			choices: [],
			usage: {
				prompt_tokens: 100,
				completion_tokens: 25,
				total_tokens: 125,
				prompt_tokens_details: { cached_tokens: 40 },
			},
		},
	];
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
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

function handleMockChat(): Response {
	return Response.json({
		id: "mock-trace-chat",
		created: Math.floor(Date.now() / 1000),
		model: "glm-5.1",
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				message: {
					role: "assistant",
					content: "Trace cache usage recorded.",
				},
			},
		],
		usage: {
			prompt_tokens: 120,
			completion_tokens: 30,
			total_tokens: 150,
			prompt_tokens_details: { cached_tokens: 60 },
		},
	});
}
