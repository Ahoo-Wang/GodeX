import { afterEach, describe, expect, test } from "bun:test";
import type { LogAttr, Logger } from "../logger";
import { createTestProviderEdge } from "../testing/provider-edge";
import type { ProviderDefinition } from "./definition";
import { Registrar } from "./registrar";

function stubProvider(name: string) {
	return createTestProviderEdge({ name });
}

function stubDefinition(name: string): ProviderDefinition {
	return {
		name,
		create: () => stubProvider(name),
	};
}

function providerConfigFor(spec: string) {
	return {
		spec,
		credentials: { api_key: "test" },
		endpoint: { base_url: `http://${spec.replace(":", "-")}` },
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
			zhipu: providerConfigFor("zhipu"),
		});

		expect(registrar.resolve("zhipu")).toBe(provider);
	});

	test("resolves factories by exact spec while preserving configured provider alias", () => {
		const registrar = new Registrar();
		let receivedBaseUrl = "";
		registrar.registerFactory("zhipu", (config) => {
			receivedBaseUrl = config.endpoint?.base_url ?? "";
			return stubProvider("zhipu");
		});

		registrar.registerProviders({
			customAlias: {
				spec: "zhipu",
				credentials: { api_key: "test" },
				endpoint: { base_url: "https://provider.example.test" },
			},
		});

		expect(registrar.list()).toEqual(["customAlias"]);
		expect(registrar.resolve("customAlias").name).toBe("zhipu");
		expect(receivedBaseUrl).toBe("https://provider.example.test");
	});

	test("reports unsupported specs by configured provider alias", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		const result = registrar.registerProviders({
			alias: providerConfigFor("missing"),
		});

		expect(result).toEqual({ registered: [], unsupported: ["alias"] });
		expect(registrar.unsupported()).toEqual(["alias"]);
	});

	test("does not normalize legacy builtin spec prefixes", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		const result = registrar.registerProviders({
			alias: providerConfigFor(["builtin", "zhipu"].join(":")),
		});

		expect(result).toEqual({ registered: [], unsupported: ["alias"] });
		expect(registrar.unsupported()).toEqual(["alias"]);
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
				zhipu: providerConfigFor("zhipu"),
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
			zhipu: providerConfigFor("zhipu"),
		});

		expect(registrar.resolve("zhipu").name).toBe("zhipu");
	});

	test("registers multiple provider definitions", () => {
		const registrar = new Registrar();

		registrar.registerDefinitions([
			stubDefinition("zhipu"),
			stubDefinition("deepseek"),
		]);
		registrar.registerProviders({
			deepseek: providerConfigFor("deepseek"),
			zhipu: providerConfigFor("zhipu"),
		});

		expect(registrar.list()).toEqual(["deepseek", "zhipu"]);
	});

	test("resolve throws for unknown provider", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));
		registrar.registerProviders({
			zhipu: providerConfigFor("zhipu"),
		});

		expect(() => registrar.resolve("missing")).toThrow(
			"Provider not registered: missing",
		);
	});

	test("list returns registered provider names", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));
		registrar.registerProviders({
			zhipu: providerConfigFor("zhipu"),
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
			zhipu: providerConfigFor("zhipu"),
			unsupported: providerConfigFor("unsupported"),
		});

		expect(registrar.list()).toEqual(["zhipu"]);
		expect(registrar.unsupported()).toEqual(["unsupported"]);
		expect(warnings).toEqual([]);
	});

	test("resets unsupported providers each time registerProviders runs", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		registrar.registerProviders({
			unsupported: providerConfigFor("unsupported"),
		});
		expect(registrar.unsupported()).toEqual(["unsupported"]);

		registrar.registerProviders({
			zhipu: providerConfigFor("zhipu"),
		});
		expect(registrar.unsupported()).toEqual([]);
	});

	test("returns registered and unsupported provider names", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => stubProvider("zhipu"));

		const result = registrar.registerProviders({
			zhipu: providerConfigFor("zhipu"),
			unsupported: providerConfigFor("unsupported"),
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
			stubDefinition("deepseek"),
		]);

		registrar.registerProviders({
			zhipu: providerConfigFor("zhipu"),
		});
		registrar.registerProviders({
			deepseek: providerConfigFor("deepseek"),
		});

		expect(registrar.list()).toEqual(["deepseek"]);
		expect(() => registrar.resolve("zhipu")).toThrow(
			"Provider not registered: zhipu",
		);
	});
});
