import { describe, expect, test } from "bun:test";
import { buildConfig } from "./builder";

describe("buildConfig", () => {
	test("composes sections into a GodeX config", () => {
		process.env.API_KEY = "secret123";
		try {
			const config = buildConfig(
				{
					server: { port: "6789", host: "127.0.0.1" },
					default_provider: "zhipu",
					providers: {
						zhipu: {
							spec: "zhipu",
							credentials: { api_key: "${API_KEY}" },
							endpoint: { base_url: "https://api.zhipu.test/v1" },
						},
					},
					models: { aliases: { "*": "zhipu/glm-5.1" } },
					session: { backend: "sqlite" },
					logging: { level: "debug" },
				},
				{},
			);

			expect(config).toMatchObject({
				server: { port: 6789, host: "127.0.0.1", idle_timeout: 0 },
				default_provider: "zhipu",
				providers: {
					zhipu: {
						spec: "zhipu",
						credentials: { api_key: "secret123" },
						endpoint: { base_url: "https://api.zhipu.test/v1" },
					},
				},
				models: { aliases: { "*": "zhipu/glm-5.1" } },
				session: {
					backend: "sqlite",
					sqlite: { path: "./data/sessions.db" },
				},
				logging: { level: "debug" },
			});
		} finally {
			delete process.env.API_KEY;
		}
	});

	test("uses environment default provider when file omits it", () => {
		process.env.GODEX_DEFAULT_PROVIDER = "deepseek";
		try {
			expect(
				buildConfig(
					{
						providers: {
							deepseek: {
								spec: "deepseek",
								credentials: { api_key: "key" },
								endpoint: { base_url: "https://api.deepseek.test/v1" },
							},
						},
					},
					{},
				).default_provider,
			).toBe("deepseek");
		} finally {
			delete process.env.GODEX_DEFAULT_PROVIDER;
		}
	});

	test("rejects legacy provider config without spec", () => {
		expect(() =>
			buildConfig(
				{
					providers: {
						zhipu: {
							api_key: "legacy-key",
							base_url: "https://legacy.example.test",
						},
					},
				},
				{},
			),
		).toThrow(
			'Legacy provider config is no longer supported: providers.zhipu must declare "spec".',
		);
	});
});
