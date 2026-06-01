import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { ApplicationContext } from "./application-context";

const config: GodeXConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			spec: "zhipu",
			credentials: { api_key: "test-key" },
			endpoint: { base_url: "http://127.0.0.1:1" },
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
		expect(app.responses).toBeDefined();
		expect(app.sessionStore).toBeDefined();
		expect(app.search.name).toBe("none");
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

	test("logs trace recorder close errors", async () => {
		const app = new ApplicationContext(config);
		const warnings: string[] = [];
		(
			app as unknown as {
				traceRecorder: { record(_e: unknown): void; close(): void };
			}
		).traceRecorder = {
			record: () => {},
			close: () => {
				throw new Error("close failed");
			},
		};
		(
			app as unknown as {
				logger: {
					warn(message: string, fields?: () => Record<string, unknown>): void;
				};
			}
		).logger = {
			warn: (message) => {
				warnings.push(message);
			},
		};

		await app.close();

		expect(warnings).toEqual(["trace.close.error"]);
	});
});
