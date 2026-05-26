import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { Registrar } from "../providers/registrar";
import { ApplicationContext } from "./application-context";

const config: GodeXConfig = {
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
	trace: {
		enabled: false,
		path: "./data/trace.db",
		max_queue_size: 10000,
		flush_interval_ms: 1000,
		batch_size: 100,
		capture_payload: false,
		payload_max_bytes: 65536,
	},
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
		expect(provider.client).toBeDefined();
	});

	test("creates sqlite session store when configured", () => {
		const sqliteConfig: GodeXConfig = {
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
			mapper: {
				request: { map: () => ({}) },
				response: { map: () => ({}) as never },
				stream: {
					map: () => [] as never[],
					buildResponseObject: () => ({}) as never,
				},
			},
			client: {
				request: async () => ({}),
				stream: async () => new ReadableStream(),
			},
		}));
		const app = new ApplicationContext(config, customRegistrar);
		expect(app.registrar).toBe(customRegistrar);
		const provider = app.registrar.resolve("zhipu");
		expect(provider).toBeDefined();
	});

	test("creates noop trace recorder when trace is disabled", () => {
		const app = new ApplicationContext(config);
		expect(app.traceRecorder).toBeDefined();
		expect(() =>
			app.traceRecorder.record({
				kind: "event",
				request_id: "req_1",
				response_id: "resp_1",
				provider: "test",
				model: "test",
				created_at: Date.now(),
				event_name: "provider.request.body",
			}),
		).not.toThrow();
	});

	test("closes trace recorder and session store", async () => {
		const app = new ApplicationContext(config);
		let traceClosed = false;
		let sessionClosed = false;
		(
			app as unknown as {
				traceRecorder: { record(_e: unknown): void; close(): void };
			}
		).traceRecorder = {
			record: () => {},
			close: () => {
				traceClosed = true;
			},
		};
		(app.sessionStore as { close?: () => void }).close = () => {
			sessionClosed = true;
		};
		await app.close();
		expect(traceClosed).toBe(true);
		expect(sessionClosed).toBe(true);
	});
});
