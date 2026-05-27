import { describe, expect, test } from "bun:test";
import { createDeepSeekProvider } from "./deepseek/factory";
import { createOpenAIProvider } from "./openai/factory";
import { OPENAI_PROVIDER_NAME } from "./openai/provider";
import { createZhipuProvider } from "./zhipu/factory";

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
});
