import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import { Registrar } from "../providers/registrar";
import { createZhipuProvider } from "../providers/zhipu/factory";
import { createBuiltinRoutes, startServer } from "../server";
import { getLoopbackPort } from "./ports";

const encoder = new TextEncoder();

let godexServer: ReturnType<typeof Bun.serve> | undefined;
let mockServer: ReturnType<typeof Bun.serve> | undefined;
let app: ApplicationContext | undefined;
let tempDir: string | undefined;

interface TraceRequestRow {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	stream: number;
	requested_prompt_cache_key: string | null;
	requested_prompt_cache_retention: string | null;
	prompt_cache_key: string | null;
	prompt_cache_retention: string | null;
	prefix_hash: string | null;
	prefix_bytes: number | null;
	cache_risk_level: string | null;
	cache_risk_reasons_json: string | null;
	tool_fingerprint_json: string | null;
	passthrough_json: string | null;
	payload_hash: string | null;
	payload_bytes: number | null;
	payload_json: string | null;
	payload_truncated: number;
}

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
	raw_usage_json: string | null;
}

afterEach(async () => {
	godexServer?.stop();
	mockServer?.stop();
	await app?.close();
	godexServer = undefined;
	mockServer = undefined;
	app = undefined;
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

		const res = await fetch(`${godexBase}/v1/responses`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "gpt-5",
				input: "Return cache usage details.",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
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
			const usageRow = db
				.query("SELECT * FROM trace_usage")
				.get() as TraceUsageRow | null;

			expect(usageRow).toMatchObject({
				provider: "zhipu",
				model: "glm-5.1",
				input_tokens: 120,
				output_tokens: 30,
				total_tokens: 150,
				cached_tokens: 60,
				cache_hit_ratio: 0.5,
			});
			expect(
				parseJson<Record<string, unknown>>(usageRow?.raw_usage_json),
			).toEqual({
				prompt_tokens: 120,
				completion_tokens: 30,
				total_tokens: 150,
				prompt_tokens_details: { cached_tokens: 60 },
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

		const res = await fetch(`${godexBase}/v1/responses`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
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
			}),
		});

		expect(res.status).toBe(200);
		const events = await collectSSEEvents(res);
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
				requested_prompt_cache_retention: null,
				prompt_cache_key: null,
				prompt_cache_retention: null,
				cache_risk_level: "medium",
				payload_json: null,
				payload_truncated: 0,
			});
			expect(requestRow?.request_id).toMatch(/^req_/);
			expect(requestRow?.response_id).toMatch(/^resp_/);
			expect(requestRow?.prefix_hash).toEqual(expect.any(String));
			expect(requestRow?.prefix_bytes).toBeGreaterThan(0);
			expect(requestRow?.payload_hash).toEqual(expect.any(String));
			expect(requestRow?.payload_bytes).toBeGreaterThan(0);

			expect(parseJson<string[]>(requestRow?.cache_risk_reasons_json)).toEqual([
				"prompt_cache_key was not preserved in provider request",
			]);
			expect(
				parseJson<Record<string, boolean>>(requestRow?.passthrough_json),
			).toEqual({
				prompt_cache_key: false,
				prompt_cache_retention: true,
				cache_control: false,
			});
			expect(parseJson(requestRow?.tool_fingerprint_json)).toMatchObject({
				names: ["lookup_order", "web_search"],
			});

			expect(usageRow).toMatchObject({
				request_id: requestRow?.request_id,
				response_id: requestRow?.response_id,
				provider: "zhipu",
				model: "glm-5.1",
				input_tokens: 100,
				output_tokens: 25,
				total_tokens: 125,
				cached_tokens: 40,
				cache_hit_ratio: 0.4,
				raw_usage_json: null,
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

	test("tracks repeated prompt cache keys and flags changed prefixes", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "godex-trace-cache-e2e-"));
		const upstreamRequests: Record<string, unknown>[] = [];
		const mockBase = await startMockZhipu(upstreamRequests);
		const tracePath = join(tempDir, "trace.db");
		const godexBase = await startGodex(mockBase, tracePath);

		await expectCompleted(
			await postStreamingResponse(godexBase, {
				prompt_cache_key: "cache-mechanism-key",
				input: "Use the stable cache prefix.",
			}),
		);
		await expectCompleted(
			await postStreamingResponse(godexBase, {
				prompt_cache_key: "cache-mechanism-key",
				input: "Use the stable cache prefix.",
			}),
		);
		await expectCompleted(
			await postStreamingResponse(godexBase, {
				prompt_cache_key: "cache-mechanism-key",
				input: "Use the changed cache prefix.",
			}),
		);

		expect(upstreamRequests).toHaveLength(3);

		await app?.close();
		app = undefined;

		const db = new Database(tracePath, { readonly: true, strict: true });
		try {
			const rows = db
				.query("SELECT * FROM trace_requests ORDER BY id")
				.all() as TraceRequestRow[];
			const usageRows = db
				.query("SELECT * FROM trace_usage ORDER BY id")
				.all() as TraceUsageRow[];

			expect(rows).toHaveLength(3);
			expect(usageRows).toHaveLength(3);
			const [first, repeated, changed] = rows as [
				TraceRequestRow,
				TraceRequestRow,
				TraceRequestRow,
			];

			expect(first.requested_prompt_cache_key).toBe("cache-mechanism-key");
			expect(repeated.requested_prompt_cache_key).toBe("cache-mechanism-key");
			expect(changed.requested_prompt_cache_key).toBe("cache-mechanism-key");
			expect(first.prefix_hash).toEqual(expect.any(String));
			expect(repeated.prefix_hash).toBe(first.prefix_hash);
			expect(changed.prefix_hash).not.toBe(first.prefix_hash);

			expect(parseJson<string[]>(first.cache_risk_reasons_json)).toEqual([
				"prompt_cache_key was not preserved in provider request",
			]);
			expect(parseJson<string[]>(repeated.cache_risk_reasons_json)).toEqual([
				"prompt_cache_key was not preserved in provider request",
			]);
			expect(parseJson<string[]>(changed.cache_risk_reasons_json)).toEqual([
				"prompt_cache_key prefix changed",
				"prompt_cache_key was not preserved in provider request",
			]);
			expect(first.cache_risk_level).toBe("medium");
			expect(repeated.cache_risk_level).toBe("medium");
			expect(changed.cache_risk_level).toBe("high");
			expect(
				parseJson<Record<string, boolean>>(changed.passthrough_json),
			).toEqual({
				prompt_cache_key: false,
				prompt_cache_retention: true,
				cache_control: false,
			});
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
				api_key: "test-key",
				base_url: mockBase,
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
			api_key: "test-key",
			base_url: mockBase,
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

async function postStreamingResponse(
	godexBase: string,
	body: Record<string, unknown>,
): Promise<Response> {
	return fetch(`${godexBase}/v1/responses`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: "gpt-5",
			stream: true,
			...body,
		}),
	});
}

async function expectCompleted(res: Response): Promise<void> {
	expect(res.status).toBe(200);
	const events = await collectSSEEvents(res);
	expect(events.some((event) => event.type === "response.completed")).toBe(
		true,
	);
}

async function collectSSEEvents(
	res: Response,
): Promise<Record<string, unknown>[]> {
	const text = await res.text();
	return text
		.split("\n")
		.filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
		.map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

function parseJson<T = unknown>(value: string | null | undefined): T {
	expect(value).toEqual(expect.any(String));
	return JSON.parse(value as string) as T;
}
