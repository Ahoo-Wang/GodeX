import { describe, expect, test } from "bun:test";
import type { ProviderCapabilities } from "../compatibility";
import { bridgeDialectFromCapabilities } from "./profile";

describe("bridgeDialectFromCapabilities", () => {
	test("derives native tool types from supported minus degraded capabilities", () => {
		const capabilities = {
			parameters: { supported: new Set() },
			tools: {
				supported: new Set(["function", "custom", "mcp"]),
				degraded: new Map([["custom", "function"]]),
				maxTools: 32,
			},
			toolChoice: { supported: new Set(["auto", "function"]) },
			responseFormats: { supported: new Set(["text"]) },
			reasoning: { effort: "none" },
			streaming: { usage: false },
		} satisfies ProviderCapabilities;

		const profile = bridgeDialectFromCapabilities(
			"test-provider",
			capabilities,
		);

		expect(profile.provider).toBe("test-provider");
		expect([...profile.tools.native].sort()).toEqual(["function", "mcp"]);
		expect(profile.tools.degraded.get("custom")).toBe("function");
		expect(profile.tools.maxTools).toBe(32);
		expect(profile.toolChoice.supported).toBe(
			capabilities.toolChoice.supported,
		);
	});
});
