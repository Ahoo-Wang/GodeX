import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	CompatibilityDecision,
	CompatibilityPlan,
	ProviderCapabilities,
} from "./compatibility-plan";
import type {
	ChatFinishReasonMapper,
	ChatRequestFactory,
	ChatToolCallIdentityResolver,
	ChatUsageMapper,
	CompatibilityNegotiator,
} from "./contract";
import type { ResponseStatusFields } from "./response-object-builder";

describe("chat mapper contracts", () => {
	test("models a provider-agnostic compatibility plan", () => {
		const capabilities: ProviderCapabilities = {
			parameters: { supported: new Set(["stream"]) },
			tools: { supported: new Set(["function"]) },
			toolChoice: { supported: new Set(["auto", "none"]) },
			responseFormats: { supported: new Set(["text", "json_object"]) },
			reasoning: { effort: "boolean" },
			streaming: { usage: true },
		};
		const decision: CompatibilityDecision = {
			action: "degraded",
			reason: "provider only supports auto",
			effectiveValue: "auto",
		};
		const plan: CompatibilityPlan = {
			capabilities,
			diagnostics: [],
			parameters: { tool_choice: decision },
			tools: new Map([["function", { action: "supported" }]]),
			toolChoice: decision,
		};

		expect(plan.tools.get("function")?.action).toBe("supported");
		expect(plan.toolChoice?.effectiveValue).toBe("auto");
	});

	test("contracts compose strongly typed request and response helpers", () => {
		const negotiator: CompatibilityNegotiator = {
			negotiate: () => ({
				capabilities: {
					parameters: { supported: new Set() },
					tools: { supported: new Set() },
					toolChoice: { supported: new Set() },
					responseFormats: { supported: new Set() },
					reasoning: { effort: "none" },
					streaming: { usage: false },
				},
				diagnostics: [],
				parameters: {},
				tools: new Map(),
			}),
		};
		const factory: ChatRequestFactory<{
			model: string;
			messages: string[];
		}> = {
			create: (ctx, _plan) => ({ model: ctx.resolved.model, messages: [] }),
		};
		const finishReason: ChatFinishReasonMapper<string> = {
			map: () => ({ status: "completed" }) satisfies ResponseStatusFields,
		};
		const identity: ChatToolCallIdentityResolver = {
			resolve: (_ctx, upstreamName) => ({ upstreamName, name: upstreamName }),
		};

		expect(negotiator.negotiate({} as ResponsesContext).tools.size).toBe(0);
		expect(
			factory.create(
				{ resolved: { model: "m" } } as ResponsesContext,
				{} as CompatibilityPlan,
			),
		).toEqual({ model: "m", messages: [] });
		expect(finishReason.map("stop").status).toBe("completed");
		expect(identity.resolve({} as ResponsesContext, "get_weather").name).toBe(
			"get_weather",
		);
	});

	test("usage mapper source type is independent of response source type", () => {
		const usageMapper: ChatUsageMapper<{ custom_usage: { total: number } }> = {
			map: (source) => ({
				input_tokens: 0,
				output_tokens: 0,
				total_tokens: source.custom_usage.total,
			}),
		};
		expect(usageMapper.map({ custom_usage: { total: 5 } })).toEqual({
			input_tokens: 0,
			output_tokens: 0,
			total_tokens: 5,
		});
	});
});
