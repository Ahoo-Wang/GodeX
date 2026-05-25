import { afterEach, describe, expect, test } from "bun:test";
import type { Provider } from "../adapter/provider";
import { Registrar } from "./registrar";

const stubProvider: Provider<unknown, unknown, unknown> = {
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
};

const originalWarn = console.warn;

afterEach(() => {
	console.warn = originalWarn;
});

describe("Registrar", () => {
	test("register factory, registerProviders, and resolve a provider", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);
		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});

		const provider = registrar.resolve("zhipu");
		expect(provider).toBe(stubProvider);
	});

	test("resolve throws for unknown provider", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);
		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});

		expect(() => registrar.resolve("missing")).toThrow(
			"Provider not registered: missing",
		);
	});

	test("list returns registered provider names", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);
		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});

		expect(registrar.list()).toEqual(["zhipu"]);
	});

	test("resolve throws when provider not registered", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);

		expect(() => registrar.resolve("zhipu")).toThrow(
			"Provider not registered: zhipu",
		);
	});

	test("tracks unsupported configured providers without writing console warnings", () => {
		const warnings: unknown[][] = [];
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);

		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
			unsupported: { api_key: "test", base_url: "http://unsupported" },
		});

		expect(registrar.list()).toEqual(["zhipu"]);
		expect(registrar.unsupported()).toEqual(["unsupported"]);
		expect(warnings).toEqual([]);
	});

	test("resets unsupported providers each time registerProviders runs", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider);

		registrar.registerProviders({
			unsupported: { api_key: "test", base_url: "http://unsupported" },
		});
		expect(registrar.unsupported()).toEqual(["unsupported"]);

		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});
		expect(registrar.unsupported()).toEqual([]);
	});
});
