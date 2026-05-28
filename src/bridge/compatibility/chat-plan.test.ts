import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../adapter/compatibility";
import type { ResponsesContext } from "../../context/responses-context";
import {
	CHAT_COMPLETIONS_COMMON_IGNORED_PARAMETERS,
	planBridgeCompatibility,
	RESPONSES_ENVELOPE_IGNORED_PARAMETERS,
} from "./chat-plan";
import type { ProviderCapabilities } from "./compatibility-plan";

const capabilities: ProviderCapabilities = {
	parameters: { supported: new Set(["stream", "text.format"]) },
	tools: { supported: new Set(["function"]) },
	toolChoice: { supported: new Set(["auto", "none"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
		degraded: new Map([["json_schema", "json_object"]]),
	},
	reasoning: { effort: "none" },
	streaming: { usage: true },
};

function ctx(request: Record<string, unknown>): ResponsesContext {
	const diagnostics: ResponsesContext["diagnostics"] = [];
	return {
		request,
		resolved: { provider: "acme", model: "acme-chat" },
		diagnostics,
		addDiagnostic(diagnostic: CompatibilityDiagnostic) {
			diagnostics.push(diagnostic);
		},
	} as unknown as ResponsesContext;
}

describe("planBridgeCompatibility", () => {
	test("plans common Chat Completions ignored parameters and json_schema downgrade", () => {
		const testCtx = ctx({
			background: true,
			conversation: { id: "conv_1" },
			prompt: { id: "prompt_1" },
			truncation: "auto",
			parallel_tool_calls: true,
			text: {
				format: {
					type: "json_schema",
					name: "payload",
					schema: { type: "object" },
				},
			},
		});

		const plan = planBridgeCompatibility(testCtx, {
			providerLabel: "Acme",
			capabilities,
			ignoredParameters: CHAT_COMPLETIONS_COMMON_IGNORED_PARAMETERS,
		});

		expect(plan.parameters.background).toMatchObject({ action: "ignored" });
		expect(plan.parameters.conversation).toMatchObject({ action: "ignored" });
		expect(plan.parameters.prompt).toMatchObject({ action: "ignored" });
		expect(plan.parameters.truncation).toMatchObject({ action: "ignored" });
		expect(plan.parameters.parallel_tool_calls).toMatchObject({
			action: "ignored",
		});
		expect(plan.responseFormat).toMatchObject({
			action: "degraded",
			effectiveValue: { type: "json_object" },
		});
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				path: "text.format",
				action: "degraded",
				metadata: expect.objectContaining({
					provider: "acme",
					model: "acme-chat",
					effectiveValue: { type: "json_object" },
				}),
			}),
		);
	});

	test("lets providers opt into extra Responses envelope ignored parameters", () => {
		const testCtx = ctx({
			metadata: { trace: "yes" },
			service_tier: "priority",
			prompt_cache_key: "cache-key",
			prompt_cache_retention: "24h",
			stream_options: { include_obfuscation: true },
			text: { verbosity: "low" },
		});

		const plan = planBridgeCompatibility(testCtx, {
			providerLabel: "Acme",
			capabilities,
			ignoredParameters: RESPONSES_ENVELOPE_IGNORED_PARAMETERS,
		});

		expect(Object.keys(plan.parameters).sort()).toEqual([
			"metadata",
			"prompt_cache_key",
			"prompt_cache_retention",
			"service_tier",
			"stream_options.include_obfuscation",
			"text.verbosity",
		]);
		expect(testCtx.diagnostics).toHaveLength(6);
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				path: "metadata",
				metadata: expect.objectContaining({
					parameter: "metadata",
					value: { type: "object", keys: ["trace"] },
				}),
			}),
		);
	});

	test("rejects unsupported response formats on ctx/profile path", () => {
		const testCtx = ctx({
			text: {
				format: {
					type: "xml",
				},
			},
		});

		const plan = planBridgeCompatibility(testCtx, {
			providerLabel: "Acme",
			capabilities,
		});

		expect(plan.responseFormat).toMatchObject({ action: "rejected" });
		expect(plan.parameters["text.format"]).toMatchObject({
			action: "rejected",
		});
		expect(testCtx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.param.unsupported",
				severity: "error",
				path: "text.format",
				action: "rejected",
			}),
		);
	});
});
