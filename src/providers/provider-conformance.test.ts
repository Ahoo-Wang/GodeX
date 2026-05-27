// src/providers/provider-conformance.test.ts
import { describe, expect, test } from "bun:test";
import type { ProviderMapper } from "../adapter/provider";
import { BUILTIN_PROVIDER_DEFINITIONS } from "./builtin";
import { createDeepSeekMapper } from "./deepseek/mapper/factory";
import { createOpenAIMapper } from "./openai/mapper/factory";
import { createZhipuMapper } from "./zhipu/mapper/factory";

type AnyProviderMapper = ProviderMapper<unknown, unknown, unknown>;

function validateProviderMapperShape(mapper: AnyProviderMapper): void {
	expect(mapper.request).toBeObject();
	expect(mapper.response).toBeObject();
	expect(mapper.stream).toBeObject();

	expect(typeof mapper.request.map).toBe("function");
	expect(typeof mapper.response.map).toBe("function");
	expect(typeof mapper.stream.map).toBe("function");
}

const providerMappers: [string, () => AnyProviderMapper][] = [
	["OpenAI", () => createOpenAIMapper() as unknown as AnyProviderMapper],
	["Zhipu", () => createZhipuMapper() as unknown as AnyProviderMapper],
	["DeepSeek", () => createDeepSeekMapper() as unknown as AnyProviderMapper],
];

describe("ProviderMapper conformance", () => {
	for (const [name, factory] of providerMappers) {
		describe(name, () => {
			test("has all three mapper methods", () => {
				const mapper = factory();
				validateProviderMapperShape(mapper);
			});

			test("each sub-mapper is a distinct object", () => {
				const mapper = factory();
				// Verify identity — all three mappers are different objects
				expect(mapper.request === (mapper.response as unknown)).toBeFalse();
				expect(mapper.response === (mapper.stream as unknown)).toBeFalse();
				expect(mapper.stream === (mapper.request as unknown)).toBeFalse();
			});

			test("factory returns fresh instances on each call", () => {
				const a = factory();
				const b = factory();
				expect(a.request).not.toBe(b.request);
				expect(a.response).not.toBe(b.response);
				expect(a.stream).not.toBe(b.stream);
			});

			test("request mapper .map is callable", () => {
				const mapper = factory();
				expect(typeof mapper.request.map).toBe("function");
			});

			test("response mapper .map is callable", () => {
				const mapper = factory();
				expect(typeof mapper.response.map).toBe("function");
			});

			test("stream mapper .map is callable", () => {
				const mapper = factory();
				expect(typeof mapper.stream.map).toBe("function");
			});
		});
	}
});

describe("Provider runtime conformance", () => {
	test("built-in provider definitions have unique names", () => {
		const names = BUILTIN_PROVIDER_DEFINITIONS.map(
			(definition) => definition.name,
		);

		expect(new Set(names).size).toBe(names.length);
	});

	for (const definition of BUILTIN_PROVIDER_DEFINITIONS) {
		test(`${definition.name} definition creates fresh provider contracts`, () => {
			const config = {
				api_key: `${definition.name}-key`,
				base_url: `https://${definition.name}.example.test`,
			};

			const first = definition.create(config);
			const second = definition.create(config);

			expect(first.name).toBe(definition.name);
			expect(first).not.toBe(second);
			validateProviderMapperShape(first.mapper);
			validateProviderMapperShape(second.mapper);
			expect(first.client.request).toBeFunction();
			expect(first.client.stream).toBeFunction();
		});
	}
});
