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
				web_search: {
					enabled: true,
					mode: "auto",
					provider: "none",
					on_unavailable: "client_tool_call",
					max_iterations: 2,
					timeout_ms: 10000,
				},
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

	test("uses provider name as spec when spec is not declared", () => {
		const config = buildConfig(
			{
				providers: {
					zhipu: {
						api_key: "test-key",
						base_url: "https://example.test",
					},
				},
			},
			{},
		);

		expect(config.providers.zhipu?.spec).toBe("zhipu");
	});

	test("parses web search settings", () => {
		const config = buildConfig(
			{
				providers: {},
				web_search: { provider: "mock", on_unavailable: "fail" },
			},
			{},
		);

		expect(config.web_search?.provider).toBe("mock");
		expect(config.web_search?.on_unavailable).toBe("fail");
	});
});
