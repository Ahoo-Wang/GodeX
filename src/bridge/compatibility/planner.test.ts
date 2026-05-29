import { describe, expect, test } from "bun:test";
import type { ResponseCreateRequest } from "../../protocol/openai/responses";
import { type ProviderCapabilities, planBridgeCompatibility } from "./planner";

const capabilities: ProviderCapabilities = {
	parameters: { supported: new Set(["stream", "text.format"]) },
	tools: { supported: new Set(["function"]) },
	toolChoice: { supported: new Set(["auto", "none"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
	},
	reasoning: { effort: "none" },
	streaming: { usage: true },
};

function request(
	overrides: Partial<ResponseCreateRequest>,
): ResponseCreateRequest {
	return {
		model: "acme-chat",
		input: "Return JSON.",
		...overrides,
	};
}

describe("planBridgeCompatibility", () => {
	test("degrades strict json_schema response format to json_object", () => {
		const plan = planBridgeCompatibility({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			request: request({
				text: {
					format: {
						type: "json_schema",
						name: "payload",
						schema: { type: "object" },
						strict: true,
					},
				},
			}),
		});

		expect(plan.responseFormat).toEqual({
			action: "degraded",
			reason: "json_schema is degraded to json_object for provider acme.",
			effectiveValue: { type: "json_object" },
		});
		expect(plan.parameters["text.format"]).toEqual({
			action: "degraded",
			reason: "json_schema is degraded to json_object for provider acme.",
			effectiveValue: { type: "json_object" },
		});
		expect(plan.diagnostics).toContainEqual({
			code: "bridge.param.degraded",
			severity: "warn",
			path: "text.format",
			action: "degraded",
			message: "json_schema is degraded to json_object for provider acme.",
			metadata: {
				provider: "acme",
				model: "acme-chat",
				parameter: "text.format",
				effectiveValue: { type: "json_object" },
			},
		});
	});

	test("degrades json_schema when json_object is supported without degraded map", () => {
		const plan = planBridgeCompatibility({
			provider: "acme",
			model: "acme-chat",
			capabilities: {
				...capabilities,
				responseFormats: { supported: new Set(["text", "json_object"]) },
			},
			request: request({
				text: {
					format: {
						type: "json_schema",
						name: "payload",
						schema: { type: "object" },
						strict: true,
					},
				},
			}),
		});

		expect(plan.responseFormat).toEqual({
			action: "degraded",
			reason: "json_schema is degraded to json_object for provider acme.",
			effectiveValue: { type: "json_object" },
		});
	});

	test("ignores GodeX-owned envelope parameters with diagnostics", () => {
		const plan = planBridgeCompatibility({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			request: request({
				background: true,
				conversation: { id: "conv_1" },
				metadata: { trace: "yes" },
			}),
		});

		expect(plan.parameters.metadata).toEqual({
			action: "ignored",
			reason: "metadata is owned by GodeX and is not forwarded upstream.",
		});
		expect(plan.parameters.conversation).toEqual({
			action: "ignored",
			reason: "conversation is owned by GodeX and is not forwarded upstream.",
		});
		expect(plan.parameters.background).toEqual({
			action: "ignored",
			reason: "background is owned by GodeX and is not forwarded upstream.",
		});
		expect(plan.diagnostics).toContainEqual({
			code: "bridge.param.ignored",
			severity: "warn",
			path: "metadata",
			action: "ignored",
			message: "metadata is owned by GodeX and is not forwarded upstream.",
		});
	});

	test("rejects unsupported response format with error diagnostic", () => {
		const plan = planBridgeCompatibility({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			request: request({
				text: {
					format: {
						type: "xml",
					} as unknown as NonNullable<ResponseCreateRequest["text"]>["format"],
				},
			}),
		});

		expect(plan.responseFormat).toEqual({
			action: "rejected",
			reason: "text.format xml is not supported by provider acme.",
		});
		expect(plan.parameters["text.format"]).toEqual({
			action: "rejected",
			reason: "text.format xml is not supported by provider acme.",
		});
		expect(plan.diagnostics).toContainEqual({
			code: "bridge.param.unsupported",
			severity: "error",
			path: "text.format",
			action: "rejected",
			message: "text.format xml is not supported by provider acme.",
			metadata: {
				provider: "acme",
				model: "acme-chat",
				parameter: "text.format",
				value: "xml",
			},
		});
	});

	test("does not warn when background is false", () => {
		const plan = planBridgeCompatibility({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			request: request({ background: false }),
		});

		expect(plan.parameters.background).toBeUndefined();
		expect(plan.diagnostics).not.toContainEqual(
			expect.objectContaining({ path: "background" }),
		);
	});

	test("does not expose tool planning fields on compatibility plans", () => {
		const plan = planBridgeCompatibility({
			provider: "acme",
			model: "acme-chat",
			capabilities,
			request: request({}),
		});

		expect(Object.hasOwn(plan, "tools")).toBe(false);
		expect(Object.hasOwn(plan, "toolChoice")).toBe(false);
	});
});
