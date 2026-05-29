import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../../config";
import { ApplicationContext } from "../../context/application-context";
import { Registrar } from "../../providers/registrar";
import { createTestProviderEdge } from "../../testing/provider-edge";
import { handleHealth } from "./health";

const config: GodeXConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			spec: "zhipu",
			credentials: { api_key: "test-key" },
			endpoint: { base_url: "http://127.0.0.1:1" },
		},
		unsupported: {
			spec: "unsupported",
			credentials: { api_key: "test-key" },
			endpoint: { base_url: "http://127.0.0.1:2" },
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

function createTestApp(): ApplicationContext {
	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () =>
		createTestProviderEdge({ name: "zhipu" }),
	);
	return new ApplicationContext(config, registrar);
}

describe("GET /health", () => {
	test("reports registered and unsupported providers separately", async () => {
		const res = handleHealth(createTestApp());

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			status: string;
			providers: string[];
			unsupported_providers: string[];
		};
		expect(body.status).toBe("ok");
		expect(body.providers).toEqual(["zhipu"]);
		expect(body.unsupported_providers).toEqual(["unsupported"]);
	});
});
