import { describe, expect, test } from "bun:test";
import { ProviderError } from "../../error";
import type { ChatCompletionChunk } from "./protocol/completions";
import { DeepSeekClient } from "./provider-client";

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

describe("DeepSeekClient", () => {
	test("request returns parsed response on success", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			jsonResponse({
				id: "deepseek-response",
				object: "chat.completion",
				created: 1_764_000_000,
				model: "deepseek-v4-flash",
				choices: [
					{
						index: 0,
						finish_reason: "stop",
						message: { role: "assistant", content: "ok" },
						logprobs: null,
					},
				],
			})) as unknown as typeof fetch;

		try {
			const client = new DeepSeekClient("https://example.test", "test-key");
			const response = await client.request({
				model: "deepseek-v4-flash",
				messages: [],
			});

			expect(response.id).toBe("deepseek-response");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("request wraps HTTP errors in ProviderError", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			jsonResponse(
				{ error: { message: "bad key" } },
				401,
			)) as unknown as typeof fetch;

		try {
			const client = new DeepSeekClient("https://example.test", "bad-key");
			await expect(
				client.request({ model: "deepseek-v4-flash", messages: [] }),
			).rejects.toBeInstanceOf(ProviderError);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("stream returns typed chunks", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			sseResponse([
				{
					data: JSON.stringify({
						id: "deepseek-stream",
						object: "chat.completion.chunk",
						created: 1_764_000_000,
						model: "deepseek-v4-flash",
						choices: [
							{ index: 0, delta: { content: "hi" }, finish_reason: null },
						],
					}),
				},
			])) as unknown as typeof fetch;

		try {
			const client = new DeepSeekClient("https://example.test", "test-key");
			const eventStream = await client.stream({
				model: "deepseek-v4-flash",
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
});
