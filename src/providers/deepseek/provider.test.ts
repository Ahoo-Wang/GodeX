import { describe, expect, test } from "bun:test";
import { createDeepSeekProvider } from "./factory";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
	DeepSeekProvider,
} from "./provider";

describe("DeepSeekProvider", () => {
	test("uses the DeepSeek provider name and default base URL constant", () => {
		expect(DEEPSEEK_PROVIDER_NAME).toBe("deepseek");
		expect(DEFAULT_DEEPSEEK_BASE_URL).toBe("https://api.deepseek.com");
	});

	test("composes client and mapper responsibilities", () => {
		const provider = new DeepSeekProvider("https://example.test", "test-key");

		expect(provider.name).toBe("deepseek");
		expect(provider.client).toBeDefined();
		expect(provider.mapper.request.map).toBeFunction();
		expect(provider.mapper.response.map).toBeFunction();
		expect(provider.mapper.stream.map).toBeFunction();
	});

	test("factory creates a configured DeepSeek provider", () => {
		const provider = createDeepSeekProvider({
			api_key: "test-key",
			base_url: "",
		});

		expect(provider.name).toBe(DEEPSEEK_PROVIDER_NAME);
		expect(provider.client).toBeDefined();
		expect(provider.mapper.request.map).toBeFunction();
	});
});
