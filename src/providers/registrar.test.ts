import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_CAPABILITIES } from "../adapter/capabilities";
import type { Provider } from "../adapter/provider";
import { Registrar } from "./registrar";

const stubProvider: Provider<unknown, unknown, unknown> = {
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
};

const originalWarn = console.warn;

afterEach(() => {
	console.warn = originalWarn;
});

describe("Registrar", () => {
	test("register factory, build, and resolve a provider", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);
		registrar.build({ zhipu: { api_key: "test", base_url: "http://test" } });

		const provider = registrar.resolve("zhipu");
		expect(provider).toBe(stubProvider);
	});

	test("resolve throws for unknown provider", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);
		registrar.build({ zhipu: { api_key: "test", base_url: "http://test" } });

		expect(() => registrar.resolve("missing")).toThrow(
			"Provider not registered: missing",
		);
	});

	test("list returns registered provider names", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);
		registrar.build({ zhipu: { api_key: "test", base_url: "http://test" } });

		expect(registrar.list()).toEqual(["zhipu"]);
	});

	test("resolve throws before build is called", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);

		expect(() => registrar.resolve("zhipu")).toThrow("Registrar not built yet");
	});

	test("tracks unsupported configured providers without writing console warnings", () => {
		const warnings: unknown[][] = [];
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);

		registrar.build({
			zhipu: { api_key: "test", base_url: "http://test" },
			unsupported: { api_key: "test", base_url: "http://unsupported" },
		});

		expect(registrar.list()).toEqual(["zhipu"]);
		expect(registrar.unsupported()).toEqual(["unsupported"]);
		expect(warnings).toEqual([]);
	});

	test("resets unsupported providers each time build runs", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);

		registrar.build({
			unsupported: { api_key: "test", base_url: "http://unsupported" },
		});
		expect(registrar.unsupported()).toEqual(["unsupported"]);

		registrar.build({ zhipu: { api_key: "test", base_url: "http://test" } });
		expect(registrar.unsupported()).toEqual([]);
	});
});
