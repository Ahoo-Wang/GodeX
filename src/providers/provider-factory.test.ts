import { describe, expect, test } from "bun:test";
import { createDeepSeekProvider } from "./deepseek";
import { createZhipuProvider } from "./zhipu";

function providerConfigFor(name: string, timeout_ms?: number) {
	return {
		spec: name,
		credentials: { api_key: `${name}-key` },
		endpoint: { base_url: `https://${name}.example.test` },
		...(timeout_ms === undefined ? {} : { timeout_ms }),
	};
}

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
	test("create plain ProviderEdge contracts", () => {
		const providers = [
			createZhipuProvider(providerConfigFor("zhipu")),
			createDeepSeekProvider(providerConfigFor("deepseek")),
		];

		for (const provider of providers) {
			expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
			expect(provider.spec.protocol).toBe("chat_completions");
			expect(provider.request).toBeFunction();
			expect(provider.stream).toBeFunction();
		}
	});

	test("uses runtime config timeout for Zhipu and DeepSeek clients", async () => {
		const zhipu = createZhipuProvider(providerConfigFor("zhipu", 45_000));
		const deepseek = createDeepSeekProvider(
			providerConfigFor("deepseek", 45_000),
		);

		await expect(
			captureRequestTimeout(() =>
				zhipu.request({ model: "glm-5.1", messages: [] }),
			),
		).resolves.toBe(45_000);
		await expect(
			captureRequestTimeout(() =>
				deepseek.request({
					model: "deepseek-v4-flash",
					messages: [],
				}),
			),
		).resolves.toBe(45_000);
	});
});
