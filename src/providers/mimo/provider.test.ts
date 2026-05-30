import { describe, expect, test } from "bun:test";
import { createXiaomiProvider } from "./index";
import { DEFAULT_XIAOMI_BASE_URL, XIAOMI_PROVIDER_NAME } from "./spec";

const config = {
	spec: "xiaomi",
	credentials: { api_key: "test-key" },
	endpoint: { base_url: "https://example.test" },
};

describe("Xiaomi provider", () => {
	test("uses the Xiaomi provider name and default base URL constant", () => {
		expect(XIAOMI_PROVIDER_NAME).toBe("xiaomi");
		expect(DEFAULT_XIAOMI_BASE_URL).toBe("https://api.xiaomimimo.com/v1");
	});

	test("factory composes a plain provider contract", () => {
		const provider = createXiaomiProvider(config);

		expect(provider.name).toBe("xiaomi");
		expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
		expect(provider.spec.name).toBe(XIAOMI_PROVIDER_NAME);
		expect(provider.request).toBeFunction();
		expect(provider.stream).toBeFunction();
	});

	test("factory creates a configured Xiaomi provider", () => {
		const provider = createXiaomiProvider({
			...config,
			endpoint: undefined,
		});

		expect(provider.name).toBe(XIAOMI_PROVIDER_NAME);
		expect(provider.spec.endpoint.defaultBaseURL).toBe(DEFAULT_XIAOMI_BASE_URL);
		expect(provider.request).toBeFunction();
	});
});
