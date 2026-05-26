import { describe, expect, test } from "bun:test";
import {
	DEFAULT_DEEPSEEK_BASE_URL,
	DEEPSEEK_PROVIDER_NAME,
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
});
