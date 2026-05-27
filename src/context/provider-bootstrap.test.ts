import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import type { Logger } from "../logger";
import { Registrar } from "../providers/registrar";
import { createConfiguredRegistrar } from "./provider-bootstrap";

const logger: Logger = {
	level: "error",
	child: () => logger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

const providers: GodeXConfig["providers"] = {
	zhipu: { api_key: "test-key", base_url: "http://127.0.0.1:1" },
};

describe("createConfiguredRegistrar", () => {
	test("creates a built-in registrar when none is supplied", () => {
		const registrar = createConfiguredRegistrar(providers, logger);

		expect(registrar.list()).toEqual(["zhipu"]);
		expect(registrar.resolve("zhipu").name).toBe("zhipu");
	});

	test("reuses the supplied registrar and registers configured providers once", () => {
		const registrar = new Registrar();
		let calls = 0;
		registrar.registerFactory("zhipu", () => {
			calls++;
			return {
				name: "mock",
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
		});

		const configured = createConfiguredRegistrar(providers, logger, registrar);

		expect(configured).toBe(registrar);
		expect(calls).toBe(1);
		expect(configured.resolve("zhipu").name).toBe("mock");
	});

	test("keeps unsupported provider reporting on the registrar", () => {
		const registrar = createConfiguredRegistrar(
			{ unsupported: { api_key: "k", base_url: "http://127.0.0.1" } },
			logger,
			new Registrar(),
		);

		expect(registrar.list()).toEqual([]);
		expect(registrar.unsupported()).toEqual(["unsupported"]);
	});
});
