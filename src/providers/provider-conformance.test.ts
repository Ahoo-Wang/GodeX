// src/providers/provider-conformance.test.ts
import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../adapter/compatibility";
import type { ProviderCapabilities } from "../adapter/mapper/chat/compatibility-plan";
import type { ProviderMapper } from "../adapter/provider";
import type { ApplicationContext } from "../context/application-context";
import type { ResponsesContext } from "../context/responses-context";
import { createLogger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import { BUILTIN_PROVIDER_DEFINITIONS } from "./builtin";
import { DEEPSEEK_CAPABILITIES } from "./deepseek/mapper/capabilities";
import { createDeepSeekMapper } from "./deepseek/mapper/factory";
import { OPENAI_CAPABILITIES } from "./openai/mapper/capabilities";
import { createOpenAIMapper } from "./openai/mapper/factory";
import { ZHIPU_CAPABILITIES } from "./zhipu/mapper/capabilities";
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

const providerCapabilityCases: Array<{
	name: string;
	provider: string;
	model: string;
	capabilities: ProviderCapabilities;
	mapper: () => AnyProviderMapper;
}> = [
	{
		name: "OpenAI",
		provider: "openai",
		model: "gpt-4o",
		capabilities: OPENAI_CAPABILITIES,
		mapper: () => createOpenAIMapper() as unknown as AnyProviderMapper,
	},
	{
		name: "Zhipu",
		provider: "zhipu",
		model: "glm-5.1",
		capabilities: ZHIPU_CAPABILITIES,
		mapper: () => createZhipuMapper() as unknown as AnyProviderMapper,
	},
	{
		name: "DeepSeek",
		provider: "deepseek",
		model: "deepseek-v4-flash",
		capabilities: DEEPSEEK_CAPABILITIES,
		mapper: () => createDeepSeekMapper() as unknown as AnyProviderMapper,
	},
];

const jsonSchemaFormat = {
	type: "json_schema" as const,
	name: "person",
	description: "A person payload.",
	schema: {
		type: "object",
		properties: {
			name: { type: "string" },
			age: { type: "number" },
		},
		required: ["name", "age"],
		additionalProperties: false,
	},
	strict: true,
};

const customTool = {
	type: "custom" as const,
	name: "raw_sql",
	description: "Run raw SQL",
	format: {
		type: "grammar" as const,
		syntax: "lark" as const,
		definition: "start: /.+/",
	},
};

function createRequestContext(
	provider: string,
	model: string,
	request: Partial<ResponseCreateRequest> = {},
): ResponsesContext {
	const diagnostics: CompatibilityDiagnostic[] = [];
	return {
		request: {
			model,
			input: "Return Jane as JSON.",
			text: { format: jsonSchemaFormat },
			...request,
		} as ResponseCreateRequest,
		resolved: { provider, model },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as ApplicationContext,
		provider: { name: provider, mapper: {} as never, client: {} as never },
		diagnostics,
		addDiagnostic(diagnostic: CompatibilityDiagnostic) {
			diagnostics.push(diagnostic);
		},
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

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

describe("Provider capability conformance", () => {
	for (const {
		name,
		provider,
		model,
		capabilities,
		mapper,
	} of providerCapabilityCases) {
		test(`${name} response format degradations target supported formats`, () => {
			for (const [from, to] of capabilities.responseFormats.degraded ?? []) {
				expect(capabilities.responseFormats.supported.has(from)).toBeFalse();
				expect(capabilities.responseFormats.supported.has(to)).toBeTrue();
			}
		});

		test(`${name} response format capabilities match json_schema request mapping`, () => {
			const ctx = createRequestContext(provider, model);
			const request = mapper().request.map(ctx) as {
				response_format?: unknown;
				messages?: Array<{ role: string; content?: string }>;
			};
			const schemaDegradation =
				capabilities.responseFormats.degraded?.get("json_schema");

			if (capabilities.responseFormats.supported.has("json_schema")) {
				expect(request.response_format).toMatchObject({
					type: "json_schema",
				});
				expect(
					request.messages?.some(
						(message) =>
							typeof message.content === "string" &&
							message.content.includes("JSON Schema:"),
					),
				).toBeFalse();
				expect(ctx.diagnostics).not.toContainEqual(
					expect.objectContaining({
						path: "text.format",
						action: "degraded",
					}),
				);
				return;
			}

			expect(schemaDegradation).toBe("json_object");
			expect(request.response_format).toEqual({ type: "json_object" });
			expect(ctx.diagnostics).toContainEqual(
				expect.objectContaining({
					path: "text.format",
					action: "degraded",
				}),
			);
			const schemaMessage = request.messages?.at(-1);
			expect(schemaMessage?.role).toBe("user");
			expect(schemaMessage?.content).toEqual(
				expect.stringContaining(
					"Return only JSON that conforms to the JSON Schema below.",
				),
			);
			expect(schemaMessage?.content).toEqual(
				expect.stringContaining('"required":["name","age"]'),
			);
		});

		test(`${name} tool degradations are declared for accepted lossy mappings`, () => {
			for (const [from, to] of capabilities.tools.degraded ?? []) {
				expect(capabilities.tools.supported.has(from)).toBeTrue();
				expect(to.length).toBeGreaterThan(0);
			}
		});

		test(`${name} custom tool capability matches request mapping`, () => {
			const ctx = createRequestContext(provider, model, {
				input: "Use raw_sql.",
				text: undefined,
				tools: [customTool],
			});
			const request = mapper().request.map(ctx) as {
				tools?: Array<Record<string, unknown>>;
			};
			const customDegradation = capabilities.tools.degraded?.get("custom");

			if (customDegradation) {
				expect(request.tools?.length).toBeGreaterThan(0);
				expect(ctx.diagnostics).toContainEqual(
					expect.objectContaining({
						path: "tools[type=custom]",
						action: "degraded",
					}),
				);
				return;
			}

			expect(capabilities.tools.supported.has("custom")).toBeTrue();
			expect(request.tools).toContainEqual(
				expect.objectContaining({ type: "custom" }),
			);
			expect(ctx.diagnostics).not.toContainEqual(
				expect.objectContaining({
					path: "tools[type=custom]",
					action: "degraded",
				}),
			);
		});
	}
});
