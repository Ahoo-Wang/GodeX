import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../../config";
import { ApplicationContext } from "../../context/application-context";
import { Registrar } from "../../providers/registrar";
import { handleHealth } from "./health";

const config: GodeXConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "test-key",
			base_url: "http://127.0.0.1:1",
		},
		unsupported: {
			api_key: "test-key",
			base_url: "http://127.0.0.1:2",
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

function createTestApp(): ApplicationContext {
	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () => ({
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
