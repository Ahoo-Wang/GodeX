import { describe, expect, test } from "bun:test";
import { ProviderError } from "../../error";
import { ZhipuChatClient } from "./chat-client";
import type { ChatCompletionChunk } from "./protocol/completions";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function sseResponse(chunks: Array<{ data: string }>): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(`data: ${chunk.data}\n\n`));
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});
	return new Response(stream, {
		headers: { "Content-Type": "text/event-stream" },
	});
}

describe("ZhipuChatClient", () => {
	test("chat returns parsed response on success", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			return jsonResponse({
				id: "mock-response",
				created: 1_764_000_000,
				model: "glm-5.1",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: { role: "assistant", content: "ok" },
					},
				],
			});
		}) as unknown as typeof fetch;

		try {
			const client = new ZhipuChatClient("https://example.test", "test-key");
			const response = await client.chat({ model: "glm-5.1", messages: [] });

			expect(response.id).toBe("mock-response");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("chat throws ProviderError on HTTP error", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			return new Response("unauthorized", { status: 401 });
		}) as unknown as typeof fetch;

		try {
			const client = new ZhipuChatClient("https://example.test", "bad-key");
			try {
				await client.chat({ model: "glm-5.1", messages: [] });
				expect.unreachable("Should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(ProviderError);
				if (err instanceof ProviderError) {
					expect(err.status).toBe(502);
					expect(err.context.upstreamStatus).toBe(401);
				}
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("streamChat returns typed JsonServerSentEventStream", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			return sseResponse([
				{
					data: JSON.stringify({
						id: "zhipu_1",
						created: 1_764_000_000,
						model: "glm-5.1",
						choices: [
							{ index: 0, delta: { content: "hi" }, finish_reason: null },
						],
					}),
				},
			]);
		}) as unknown as typeof fetch;

		try {
			const client = new ZhipuChatClient("https://example.test", "test-key");
			const eventStream = await client.streamChat({
				model: "glm-5.1",
				messages: [],
			});

			const chunks: ChatCompletionChunk[] = [];
			for await (const event of eventStream) {
				chunks.push(event.data);
			}

			expect(chunks).toHaveLength(1);
			expect(chunks[0]?.choices[0]?.delta.content).toBe("hi");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("streamChat throws ProviderError on HTTP error", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			return new Response("rate limited", { status: 429 });
		}) as unknown as typeof fetch;

		try {
			const client = new ZhipuChatClient("https://example.test", "test-key");
			try {
				await client.streamChat({ model: "glm-5.1", messages: [] });
				expect.unreachable("Should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(ProviderError);
				if (err instanceof ProviderError) {
					expect(err.status).toBe(502);
					expect(err.context.upstreamStatus).toBe(429);
				}
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
