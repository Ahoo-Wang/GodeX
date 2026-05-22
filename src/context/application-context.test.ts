import { describe, expect, test } from "bun:test";
import { DEFAULT_CAPABILITIES } from "../adapter/capabilities";
import type { GodexConfig } from "../config";
import { Registrar } from "../providers/registrar";
import { ApplicationContext } from "./application-context";

const config: GodexConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "test-key",
			base_url: "http://127.0.0.1:1",
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

describe("ApplicationContext", () => {
	test("creates all services from config", () => {
		const app = new ApplicationContext(config);
		expect(app.config).toBe(config);
		expect(app.logger.level).toBe("error");
		expect(app.resolver).toBeDefined();
		expect(app.registrar).toBeDefined();
		expect(app.adapter).toBeDefined();
		expect(app.sessionStore).toBeDefined();
	});

	test("builds registrar with providers", () => {
		const app = new ApplicationContext(config);
		const provider = app.registrar.resolve("zhipu");
		expect(provider.mapper).toBeDefined();
		expect(provider.chatClient).toBeDefined();
	});

	test("creates sqlite session store when configured", () => {
		const sqliteConfig: GodexConfig = {
			...config,
			session: { backend: "sqlite", sqlite: { path: ":memory:" } },
		};
		const app = new ApplicationContext(sqliteConfig);
		expect(app.sessionStore).toBeDefined();
		app.sessionStore.close?.();
	});

	test("accepts custom registrar for testing", () => {
		const customRegistrar = new Registrar();
		customRegistrar.registerFactory("zhipu", () => ({
			name: "mock",
			capabilities: DEFAULT_CAPABILITIES,
			mapper: {
				request: { map: () => ({}) },
				response: { map: () => ({}) as never },
				stream: {
					map: () => [] as never[],
					buildResponseObject: () => ({}) as never,
				},
			},
			chatClient: {
				chat: async () => ({}),
				streamChat: async () => new ReadableStream(),
			},
		}));
		const app = new ApplicationContext(config, customRegistrar);
		expect(app.registrar).toBe(customRegistrar);
		const provider = app.registrar.resolve("zhipu");
		expect(provider).toBeDefined();
	});
});
