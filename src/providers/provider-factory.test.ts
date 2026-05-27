import { describe, expect, test } from "bun:test";
import { createDeepSeekProvider } from "./deepseek/factory";
import { createOpenAIProvider } from "./openai/factory";
import { OPENAI_PROVIDER_NAME } from "./openai/provider";
import { createZhipuProvider } from "./zhipu/factory";

function chatResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function captureRequestTimeout(run: () => Promise<unknown>) {
	const originalFetch = globalThis.fetch;
	let timeout: unknown;
	globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
		const init = args[1] as { timeout?: unknown } | undefined;
		timeout = init?.timeout;
		return chatResponse({
			id: "factory-test-response",
			created: 1_764_000_000,
			model: "factory-test-model",
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
		await run();
		return timeout;
	} finally {
		globalThis.fetch = originalFetch;
	}
}

describe("provider factories", () => {
	test("create plain provider contracts instead of provider class instances", () => {
		const providers = [
			createOpenAIProvider({
				api_key: "openai-key",
				base_url: "https://openai.example.test",
			}),
			createZhipuProvider({
				api_key: "zhipu-key",
				base_url: "https://zhipu.example.test",
			}),
			createDeepSeekProvider({
				api_key: "deepseek-key",
				base_url: "https://deepseek.example.test",
			}),
		];

		for (const provider of providers) {
			expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
			expect(provider.client.request).toBeFunction();
			expect(provider.client.stream).toBeFunction();
			expect(provider.mapper.request.map).toBeFunction();
			expect(provider.mapper.response.map).toBeFunction();
			expect(provider.mapper.stream.map).toBeFunction();
		}
	});

	test("creates the OpenAI provider with its provider name", () => {
		const provider = createOpenAIProvider({
			api_key: "openai-key",
			base_url: "https://openai.example.test",
		});

		expect(provider.name).toBe(OPENAI_PROVIDER_NAME);
	});

	test("passes factory timeout options to Zhipu and DeepSeek clients", async () => {
		const zhipu = createZhipuProvider(
			{
				api_key: "zhipu-key",
				base_url: "https://zhipu.example.test",
			},
			{ timeout: 120_000 },
		);
		const deepseek = createDeepSeekProvider(
			{
				api_key: "deepseek-key",
				base_url: "https://deepseek.example.test",
			},
			{ timeout: 120_000 },
		);

		await expect(
			captureRequestTimeout(() =>
				zhipu.client.request({ model: "glm-5.1", messages: [] }),
			),
		).resolves.toBe(120_000);
		await expect(
			captureRequestTimeout(() =>
				deepseek.client.request({
					model: "deepseek-v4-flash",
					messages: [],
				}),
			),
		).resolves.toBe(120_000);
	});
});
