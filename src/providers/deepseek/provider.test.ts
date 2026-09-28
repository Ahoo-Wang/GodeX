import { describe, expect, test } from "bun:test";
import { createDeepSeekProvider } from "./index";
import { DEEPSEEK_PROVIDER_NAME, DEFAULT_DEEPSEEK_BASE_URL } from "./spec";

const config = {
	spec: "deepseek",
	credentials: { api_key: "test-key" },
	endpoint: { base_url: "https://example.test" },
};

describe("DeepSeek provider", () => {
	test("uses the DeepSeek provider name and default base URL constant", () => {
		expect(DEEPSEEK_PROVIDER_NAME).toBe("deepseek");
		expect(DEFAULT_DEEPSEEK_BASE_URL).toBe("https://api.deepseek.com");
	});

	test("factory composes a plain provider contract", () => {
		const provider = createDeepSeekProvider(config);

		expect(provider.name).toBe("deepseek");
		expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
		expect(provider.spec.name).toBe(DEEPSEEK_PROVIDER_NAME);
		expect(provider.request).toBeFunction();
		expect(provider.stream).toBeFunction();
	});

	test("factory creates a configured DeepSeek provider", () => {
		const provider = createDeepSeekProvider({
			...config,
			endpoint: undefined,
		});

		expect(provider.name).toBe(DEEPSEEK_PROVIDER_NAME);
		expect(provider.spec.endpoint.defaultBaseURL).toBe(
			DEFAULT_DEEPSEEK_BASE_URL,
		);
		expect(provider.request).toBeFunction();
	});
});
