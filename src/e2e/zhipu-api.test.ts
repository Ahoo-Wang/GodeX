// src/e2e/zhipu-api.test.ts
//
// End-to-end coverage for the decorated ZhipuApi client itself.

import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { chatApi } from "../providers/shared/chat-api";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
} from "../providers/zhipu/protocol/completions";
import { getLoopbackPort } from "./ports";

let mockServer: ReturnType<typeof Bun.serve> | null = null;
let mockBase = "";
const upstreamRequests: Array<{
	method: string;
	pathname: string;
	authorization: string | null;
	body: Record<string, unknown>;
}> = [];

beforeAll(async () => {
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
			upstreamRequests.push({
				method: req.method,
				pathname: url.pathname,
				authorization: req.headers.get("Authorization"),
				body,
			});

			if (body.stream === true) {
				return streamResponse();
			}
			return jsonResponse();
		},
	});
	mockBase = `http://127.0.0.1:${mockServer.port}`;
});

beforeEach(() => {
	upstreamRequests.length = 0;
});

afterAll(() => {
	mockServer?.stop();
});

function jsonResponse(): Response {
	return new Response(
		JSON.stringify({
			id: "mock-chat",
			created: 1_764_000_000,
			model: "glm-5.1",
			choices: [
				{
					index: 0,
					finish_reason: "stop",
					message: { role: "assistant", content: "api ok" },
				},
			],
			usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
		}),
		{ headers: { "Content-Type": "application/json" } },
	);
}

function streamResponse(): Response {
	const encoder = new TextEncoder();
	const chunks: ChatCompletionChunk[] = [
		{
			id: "mock-stream",
			created: 1_764_000_000,
			model: "glm-5.1",
			choices: [{ index: 0, delta: { role: "assistant", content: "hel" } }],
		},
		{
			id: "mock-stream",
			created: 1_764_000_000,
			model: "glm-5.1",
			choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }],
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

function lastUpstreamRequest() {
	const request = upstreamRequests.at(-1);
	expect(request).toBeDefined();
	return request;
}

describe("E2E: ZhipuApi", () => {
	test("chatCompletions posts JSON to the Zhipu chat completions endpoint", async () => {
		const api = chatApi<
			Record<string, unknown>,
			ChatCompletionResponse,
			ChatCompletionChunk
		>({ baseURL: mockBase, apiKey: "test-key" });

		const response = await api.chatCompletions({
			model: "glm-5.1",
			messages: [{ role: "user", content: "hello" }],
			temperature: 0.2,
		});

		expect(response.id).toBe("mock-chat");
		expect(response.choices[0]?.message.content).toBe("api ok");

		const request = lastUpstreamRequest();
		expect(request?.method).toBe("POST");
		expect(request?.pathname).toBe("/chat/completions");
		expect(request?.authorization).toBe("Bearer test-key");
		expect(request?.body).toMatchObject({
			model: "glm-5.1",
			messages: [{ role: "user", content: "hello" }],
			temperature: 0.2,
		});
	});

	test("streamChatCompletions consumes SSE chunks until the DONE sentinel", async () => {
		const api = chatApi<
			Record<string, unknown>,
			ChatCompletionResponse,
			ChatCompletionChunk
		>({ baseURL: mockBase, apiKey: "stream-key" });

		const eventStream = await api.streamChatCompletions({
			model: "glm-5.1",
			stream: true,
			messages: [{ role: "user", content: "stream please" }],
		});

		const chunks: ChatCompletionChunk[] = [];
		for await (const event of eventStream) {
			chunks.push(event.data);
		}

		expect(chunks).toHaveLength(2);
		expect(
			chunks.map((chunk) => chunk.choices[0]?.delta.content).join(""),
		).toBe("hello");
		expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe("stop");

		const request = lastUpstreamRequest();
		expect(request?.authorization).toBe("Bearer stream-key");
		expect(request?.body).toMatchObject({
			model: "glm-5.1",
			stream: true,
			messages: [{ role: "user", content: "stream please" }],
		});
	});
});
