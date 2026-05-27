import { afterEach, describe, expect, test } from "bun:test";
import type { Provider } from "../adapter/provider";
import type { LogAttr, Logger } from "../logger";
import type { ProviderDefinition } from "./definition";
import { Registrar } from "./registrar";

function stubProvider(name: string): Provider<unknown, unknown, unknown> {
	return {
		name,
		mapper: {
			request: { map: () => ({}) },
			response: { map: () => ({}) as never },
			stream: {
				map: () => [] as never[],
			},
		},
		client: {
			request: async () => ({}),
			stream: async () => new ReadableStream(),
		},
	};
}

function stubDefinition(name: string): ProviderDefinition {
	return {
		name,
		create: () => stubProvider(name),
	};
}

function readAttr(attr: LogAttr | undefined): Record<string, unknown> {
	if (!attr) return {};
	return typeof attr === "function" ? attr() : attr;
}

function captureLogger(
	events: Array<{ level: string; payload: unknown }>,
): Logger {
	return {
		level: "debug",
		child: () => captureLogger(events),
		trace: () => {},
		debug: (_event, attr) => {
			events.push({ level: "debug", payload: readAttr(attr) });
		},
		info: (_event, attr) => {
			events.push({ level: "info", payload: readAttr(attr) });
		},
		warn: () => {},
		error: () => {},
	};
}

const originalWarn = console.warn;

afterEach(() => {
	console.warn = originalWarn;
});

describe("Registrar", () => {
	test("register factory, registerProviders, and resolve a provider", () => {
		const registrar = new Registrar();
		const provider = stubProvider("zhipu");
		registrar.registerFactory("zhipu", () => provider);
		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});

		expect(registrar.resolve("zhipu")).toBe(provider);
	});

	test("reports whether a provider factory is registered", () => {
		const registrar = new Registrar();

		expect(registrar.hasFactory("zhipu")).toBeFalse();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		expect(registrar.hasFactory("zhipu")).toBeTrue();
	});

	test("logs successful registration at debug level", () => {
		const events: Array<{ level: string; payload: unknown }> = [];
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		registrar.registerProviders(
			{
				zhipu: { api_key: "test", base_url: "http://test" },
			},
			captureLogger(events),
		);

		expect(events).toEqual([
			{
				level: "debug",
				payload: { registered: ["zhipu"], skipped: [] },
			},
		]);
	});

	test("registers a single provider definition", () => {
		const registrar = new Registrar();

		registrar.registerDefinition(stubDefinition("zhipu"));
		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});

		expect(registrar.resolve("zhipu").name).toBe("zhipu");
	});

	test("registers multiple provider definitions", () => {
		const registrar = new Registrar();

		registrar.registerDefinitions([
			stubDefinition("zhipu"),
			stubDefinition("openai"),
		]);
		registrar.registerProviders({
			openai: { api_key: "test", base_url: "http://openai" },
			zhipu: { api_key: "test", base_url: "http://zhipu" },
		});

		expect(registrar.list()).toEqual(["openai", "zhipu"]);
	});

	test("resolve throws for unknown provider", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));
		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});

		expect(() => registrar.resolve("missing")).toThrow(
			"Provider not registered: missing",
		);
	});

	test("list returns registered provider names", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));
		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});

		expect(registrar.list()).toEqual(["zhipu"]);
	});

	test("resolve throws when provider not registered", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

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
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

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
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		registrar.registerProviders({
			unsupported: { api_key: "test", base_url: "http://unsupported" },
		});
		expect(registrar.unsupported()).toEqual(["unsupported"]);

		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
		});
		expect(registrar.unsupported()).toEqual([]);
	});

	test("returns registered and unsupported provider names", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		const result = registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://test" },
			unsupported: { api_key: "test", base_url: "http://unsupported" },
		});

		expect(result).toEqual({
			registered: ["zhipu"],
			unsupported: ["unsupported"],
		});
	});

	test("replaces stale provider instances on each registerProviders call", () => {
		const registrar = new Registrar();
		registrar.registerDefinitions([
			stubDefinition("zhipu"),
			stubDefinition("openai"),
		]);

		registrar.registerProviders({
			zhipu: { api_key: "test", base_url: "http://zhipu" },
		});
		registrar.registerProviders({
			openai: { api_key: "test", base_url: "http://openai" },
		});

		expect(registrar.list()).toEqual(["openai"]);
		expect(() => registrar.resolve("zhipu")).toThrow(
			"Provider not registered: zhipu",
		);
	});
});
