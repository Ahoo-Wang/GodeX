import { describe, expect, test } from "bun:test";
import { DEFAULT_CAPABILITIES } from "../../adapter/capabilities";
import type { GodeXConfig } from "../../config";
import { ApplicationContext } from "../../context/application-context";
import { Registrar } from "../../providers/registrar";
import { handleModels } from "./models";

const config: GodeXConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	models: { aliases: { "gpt-5": "zhipu/glm-5.1" } },
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
	return new ApplicationContext(config, registrar);
}

describe("GET /v1/models", () => {
	test("lists models from root aliases", async () => {
		const app = createTestApp();
		const res = handleModels(app);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			object: string;
			data: { id: string; object: string; owned_by: string }[];
		};

		expect(body.object).toBe("list");
		expect(body.data).toEqual([
			{ id: "gpt-5", object: "model", owned_by: "zhipu" },
		]);
	});

	test("omits aliases pointing to unregistered providers", async () => {
		const cfg: GodeXConfig = {
			...config,
			models: {
				aliases: {
					"gpt-5": "zhipu/glm-5.1",
					ghost: "unsupported/ghost-model",
					"gpt-4o": "zhipu/glm-4.7",
				},
			},
		};
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => ({
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
		const app = new ApplicationContext(cfg, registrar);
		const res = handleModels(app);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			object: string;
			data: { id: string; object: string; owned_by: string }[];
		};

		expect(body.object).toBe("list");
		expect(body.data.some((m) => m.id === "ghost")).toBe(false);
		expect(body.data.some((m) => m.id === "gpt-5")).toBe(true);
		expect(body.data.some((m) => m.id === "gpt-4o")).toBe(true);
	});
});
