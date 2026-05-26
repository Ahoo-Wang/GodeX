import { describe, expect, test } from "bun:test";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type {
	CompatibilityPlan,
	ProviderCapabilities,
} from "./compatibility-plan";
import type { CompatibilityNegotiator } from "./contract";
import { ChatRequestMapper } from "./request-mapper";

interface TestRequest {
	model: string;
	messages: string[];
	tools?: string[];
	tool_choice?: string;
	stream?: boolean;
	temperature?: number;
}

const capabilities: ProviderCapabilities = {
	parameters: { supported: new Set(["stream", "temperature"]) },
	tools: { supported: new Set(["function"]) },
	toolChoice: { supported: new Set(["auto"]) },
	responseFormats: { supported: new Set(["text"]) },
	reasoning: { effort: "none" },
	streaming: { usage: true },
};

function ctx(): ResponsesContext {
	const diagnostics: unknown[] = [];
	return {
		request: {
			model: "test/model",
			input: "Hello",
			stream: true,
			temperature: 0.5,
		} as never,
		resolved: { provider: "test", model: "upstream-model" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: { mapper: {} as never, client: {} as never },
		attributes: new Map(),
		diagnostics,
		addDiagnostic(d: unknown) {
			diagnostics.push(d);
		},
	} as unknown as ResponsesContext;
}

describe("ChatRequestMapper", () => {
	test("negotiates once and composes provider request parts", async () => {
		let negotiateCount = 0;
		const plan: CompatibilityPlan = {
			capabilities,
			diagnostics: [],
			parameters: {},
			tools: new Map([["function", { action: "supported" }]]),
			toolChoice: { action: "supported", effectiveValue: "auto" },
		};
		const negotiator: CompatibilityNegotiator = {
			negotiate: () => {
				negotiateCount += 1;
				return plan;
			},
		};
		const mapper = new ChatRequestMapper<TestRequest, string, string[], string>(
			{
				negotiator,
				factory: {
					create: (requestCtx, _plan) => ({
						model: requestCtx.resolved.model,
						messages: [],
					}),
				},
				messages: { map: () => ["user: Hello"] },
				tools: { map: () => ["get_weather"] },
				toolChoice: {
					map: (_ctx, compatibilityPlan, tools) =>
						tools && tools.length > 0
							? (compatibilityPlan.toolChoice?.effectiveValue as string)
							: undefined,
				},
				options: {
					apply: (requestCtx, _plan, request) => {
						request.stream = requestCtx.request.stream;
						request.temperature = requestCtx.request.temperature;
					},
				},
			},
		);

		expect(mapper.map(ctx())).toEqual({
			model: "upstream-model",
			messages: ["user: Hello"],
			tools: ["get_weather"],
			tool_choice: "auto",
			stream: true,
			temperature: 0.5,
		});
		expect(negotiateCount).toBe(1);
	});

	test("errors from negotiator propagate without wrapping", () => {
		const mapper = new ChatRequestMapper<TestRequest, string, string[], string>(
			{
				negotiator: {
					negotiate: () => {
						throw new Error("negotiator failure");
					},
				},
				factory: { create: (_ctx, _plan) => ({ model: "m", messages: [] }) },
				messages: { map: () => [] },
				tools: { map: () => undefined },
				toolChoice: { map: () => undefined },
				options: { apply: () => undefined },
			},
		);

		expect(() => mapper.map(ctx())).toThrow("negotiator failure");
	});

	test("omits tools and tool choice when sub-mappers return undefined", () => {
		const mapper = new ChatRequestMapper<TestRequest, string, string[], string>(
			{
				negotiator: {
					negotiate: () => ({
						capabilities,
						diagnostics: [],
						parameters: {},
						tools: new Map(),
					}),
				},
				factory: { create: (_ctx, _plan) => ({ model: "m", messages: [] }) },
				messages: { map: () => [] },
				tools: { map: () => undefined },
				toolChoice: { map: () => undefined },
				options: { apply: () => undefined },
			},
		);

		expect(mapper.map(ctx())).toEqual({ model: "m", messages: [] });
	});
});
