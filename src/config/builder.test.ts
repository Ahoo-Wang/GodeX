import { describe, expect, test } from "bun:test";
import { buildConfig } from "./builder";

describe("buildConfig", () => {
	test("composes sections into a GodeX config", () => {
		process.env.API_KEY = "secret123";
		try {
			const config = buildConfig(
				{
					server: { port: "6789", host: "127.0.0.1" },
					default_provider: "openai",
					providers: {
						openai: {
							api_key: "${API_KEY}",
							base_url: "https://api.openai.test/v1",
						},
					},
					models: { aliases: { "*": "openai/gpt-5" } },
					session: { backend: "sqlite" },
					logging: { level: "debug" },
				},
				{},
			);

			expect(config).toMatchObject({
				server: { port: 6789, host: "127.0.0.1", idle_timeout: 0 },
				default_provider: "openai",
				providers: {
					openai: {
						api_key: "secret123",
						base_url: "https://api.openai.test/v1",
					},
				},
				models: { aliases: { "*": "openai/gpt-5" } },
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
								api_key: "key",
								base_url: "https://api.deepseek.test/v1",
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
});
