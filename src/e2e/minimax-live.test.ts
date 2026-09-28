import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "../context/application-context";
import type {
	ResponseCreateRequest,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import {
	createMiniMaxProvider,
	DEFAULT_MINIMAX_BASE_URL,
} from "../providers/minimax";
import { Registrar } from "../providers/registrar";
import { createBuiltinRoutes, startServer } from "../server";
import {
	collectGodexStreamEvents,
	type GodeXClient,
	godexClient,
} from "./godex-client";
import { getLoopbackPort } from "./ports";

const apiKey = process.env.MINIMAX_API_KEY;
const liveEnabled = process.env.MINIMAX_LIVE_TESTS === "1";
const liveDescribe = apiKey && liveEnabled ? describe : describe.skip;
const minimaxBaseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_MINIMAX_BASE_URL;
const liveModel = process.env.MINIMAX_LIVE_MODEL ?? "MiniMax-M3";
const maxOutputTokens = parsePositiveNumber(
	process.env.MINIMAX_LIVE_MAX_OUTPUT_TOKENS,
	512,
);
const liveImageUrl =
	process.env.MINIMAX_LIVE_IMAGE_URL ??
	"https://filecdn.minimax.chat/public/fe9d04da-f60e-444d-a2e0-18ae743add33.jpeg";
const liveVideoUrl =
	process.env.MINIMAX_LIVE_VIDEO_URL ??
	"https://filecdn.minimax.chat/public/ee8c1648-21f1-41b7-8397-65022d22ffe5.mp4";

let godexServer: ReturnType<typeof Bun.serve> | null = null;
let client: GodeXClient;

function parsePositiveNumber(
	value: string | undefined,
	fallback: number,
): number {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createLiveConfig(port: number): GodeXConfig {
	return {
		server: { port, host: "127.0.0.1" },
		default_provider: "minimax",
		models: {
			aliases: {
				"gpt-5": `minimax/${liveModel}`,
			},
		},
		providers: {
			minimax: {
				spec: "minimax",
				credentials: { api_key: apiKey ?? "" },
				endpoint: { base_url: minimaxBaseUrl },
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
	registrar.registerFactory("minimax", () =>
		createMiniMaxProvider({
			spec: "minimax",
			credentials: { api_key: apiKey },
			endpoint: { base_url: minimaxBaseUrl },
			timeout_ms: 120_000,
		}),
	);

	const app = new ApplicationContext(config, registrar);

	godexServer = startServer({
		config,
		configPath: "minimax-live-test",
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

async function expectCompletedResponse(res: Response): Promise<{
	status: string;
	output_text?: string;
	usage?: { total_tokens: number } | null;
}> {
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		status: string;
		output_text?: string;
		usage?: { total_tokens: number } | null;
	};
	expect(body.status).toBe("completed");
	expect(typeof body.output_text).toBe("string");
	expect(body.output_text?.length ?? 0).toBeGreaterThan(0);
	expect(body.usage?.total_tokens ?? 0).toBeGreaterThan(0);
	return body;
}

liveDescribe("MiniMax live e2e", () => {
	test("returns a non-stream response through GodeX", async () => {
		const res = await postResponses({
			model: "gpt-5",
			input: "Reply with exactly: ok",
			temperature: 0,
			max_output_tokens: maxOutputTokens,
			tool_choice: "none",
		});

		await expectCompletedResponse(res);
	}, 120_000);

	test("understands image input through GodeX", async () => {
		const res = await postResponses({
			model: "gpt-5",
			input: [
				{
					role: "user",
					content: [
						{
							type: "input_text",
							text: "Describe the main subject in one short sentence.",
						},
						{
							type: "input_image",
							image_url: liveImageUrl,
							detail: "low",
						},
					],
				},
			],
			temperature: 0,
			max_output_tokens: maxOutputTokens,
			reasoning: { effort: "medium" },
			tool_choice: "none",
		});

		await expectCompletedResponse(res);
	}, 120_000);

	test("understands video input through GodeX", async () => {
		const res = await postResponses({
			model: "gpt-5",
			input: [
				{
					role: "user",
					content: [
						{
							type: "input_text",
							text: "Describe the visible action in one short sentence.",
						},
						{
							type: "input_file",
							file_url: liveVideoUrl,
							detail: "low",
						},
					],
				},
			],
			temperature: 0,
			max_output_tokens: maxOutputTokens,
			reasoning: { effort: "none" },
			tool_choice: "none",
		});

		await expectCompletedResponse(res);
	}, 120_000);

	test("streams Responses-compatible lifecycle events", async () => {
		const events = await collectResponseStreamEvents({
			model: "gpt-5",
			input:
				"Reply with one short sentence containing the token godex-minimax-stream.",
			stream: true,
			temperature: 0,
			max_output_tokens: maxOutputTokens,
			reasoning: { effort: "medium" },
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
});
