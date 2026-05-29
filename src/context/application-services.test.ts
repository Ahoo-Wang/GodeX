import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { Registrar } from "../providers/registrar";
import { MemoryResponseSessionStore } from "../session/memory";
import { createTestProviderEdge } from "../testing/provider-edge";
import { NoopTraceRecorder } from "../trace";
import { createApplicationServices } from "./application-services";

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

describe("createApplicationServices", () => {
	test("composes all services from config", () => {
		const services = createApplicationServices(config);

		expect(services.logger.level).toBe("error");
		expect(services.resolver.resolve("glm-5.1")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
		expect(services.registrar.resolve("zhipu")).toBeDefined();
		expect(services.responses).toBeDefined();
		expect(services.sessionStore).toBeInstanceOf(MemoryResponseSessionStore);
		expect(services.traceEnabled).toBe(false);
		expect(services.traceRecorder).toBeInstanceOf(NoopTraceRecorder);
	});

	test("reuses a supplied registrar", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () =>
			createTestProviderEdge({ name: "mock" }),
		);

		const services = createApplicationServices(config, registrar);

		expect(services.registrar).toBe(registrar);
		expect(services.registrar.resolve("zhipu").name).toBe("mock");
	});
});
