import { describe, expect, test } from "bun:test";
import { loadRuntimeConfig } from "./load";

const validConfig = {
	server: { port: 3000 },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "secret-key",
			base_url: "https://example.test/api",
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

describe("loadRuntimeConfig", () => {
	test("loads config through the runtime file loader and applies CLI overrides", () => {
		const loaded = loadRuntimeConfig(
			{
				config: "custom.yaml",
				host: "127.0.0.1",
				port: "3100",
				logLevel: "debug",
			},
			{
				loadConfigFromFile: (path) =>
					path === "custom.yaml" ? validConfig : null,
			},
		);

		expect(loaded.path).toBe("custom.yaml");
		expect(loaded.config.server.host).toBe("127.0.0.1");
		expect(loaded.config.server.port).toBe(3100);
		expect(loaded.config.logging.level).toBe("debug");
	});

	test("reports missing config files with a recovery hint", () => {
		expect(() =>
			loadRuntimeConfig(
				{ config: "missing.yaml" },
				{ loadConfigFromFile: () => null },
			),
		).toThrow(
			"Config file not found: missing.yaml\nFix: pass --config <path> or run `godex init` to create one.",
		);
	});
});
