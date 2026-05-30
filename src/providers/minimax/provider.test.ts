import { describe, expect, test } from "bun:test";
import { createMiniMaxProvider } from "./index";
import { DEFAULT_MINIMAX_BASE_URL, MINIMAX_PROVIDER_NAME } from "./spec";

const config = {
	spec: "minimax",
	credentials: { api_key: "test-key" },
	endpoint: { base_url: "https://example.test" },
};

describe("MiniMax provider", () => {
	test("uses the MiniMax provider name and default base URL constant", () => {
		expect(MINIMAX_PROVIDER_NAME).toBe("minimax");
		expect(DEFAULT_MINIMAX_BASE_URL).toBe("https://api.minimaxi.com/v1");
	});

	test("factory composes a plain provider contract", () => {
		const provider = createMiniMaxProvider(config);

		expect(provider.name).toBe("minimax");
		expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
		expect(provider.spec.name).toBe(MINIMAX_PROVIDER_NAME);
		expect(provider.request).toBeFunction();
		expect(provider.stream).toBeFunction();
	});

	test("factory creates a configured MiniMax provider", () => {
		const provider = createMiniMaxProvider({
			...config,
			endpoint: undefined,
		});

		expect(provider.name).toBe(MINIMAX_PROVIDER_NAME);
		expect(provider.spec.endpoint.defaultBaseURL).toBe(
			DEFAULT_MINIMAX_BASE_URL,
		);
		expect(provider.request).toBeFunction();
	});
});
