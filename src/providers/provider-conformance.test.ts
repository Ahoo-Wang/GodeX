// src/providers/provider-conformance.test.ts
import { describe, expect, test } from "bun:test";
import type { ProviderMapper } from "../adapter/provider";
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
