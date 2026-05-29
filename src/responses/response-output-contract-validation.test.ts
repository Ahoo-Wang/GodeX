import { describe, expect, test } from "bun:test";
import { type OutputContractPlan, planOutputContract } from "../bridge/output";
import type { ResponsesContext } from "../context/responses-context";
import { BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT, GodeXError } from "../error";
import type { ResponseObject } from "../protocol/openai/responses";
import { validateResponseOutputContract } from "./response-output-contract-validation";

const degradedJsonSchemaPlan = {
	responseFormat: {
		action: "degraded",
		effectiveValue: { type: "json_object" },
	},
} as const;

function response(outputText: string): ResponseObject {
	return {
		id: "resp_test",
		object: "response",
		created_at: 1,
		status: "completed",
		model: "test-model",
		output: [
			{
				id: "msg_test",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: outputText }],
			},
		],
		output_text: outputText,
	};
}

function degradedContract(strict: boolean): OutputContractPlan {
	return planOutputContract({
		format: {
			type: "json_schema",
			name: "payload",
			schema: { type: "object" },
			strict,
		},
		responseFormatDecision: degradedJsonSchemaPlan.responseFormat,
	});
}

function strictDegradedContract(): OutputContractPlan {
	return degradedContract(true);
}

const ctx = {
	resolved: { provider: "deepseek", model: "deepseek-v4-flash" },
	addDiagnostic: () => undefined,
} as unknown as ResponsesContext;

describe("validateResponseOutputContract", () => {
	test("rejects invalid JSON when strict json_schema was degraded to json_object", () => {
		const contract = strictDegradedContract();

		expect(contract.requiresValidJson).toBe(true);
		expect(() =>
			validateResponseOutputContract(ctx, contract, response("not json")),
		).toThrow(GodeXError);
		try {
			validateResponseOutputContract(ctx, contract, response("not json"));
			throw new Error("expected validation to fail");
		} catch (err) {
			expect(err).toBeInstanceOf(GodeXError);
			expect((err as GodeXError).code).toBe(
				BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
			);
		}
	});

	test("allows valid JSON when strict json_schema was degraded to json_object", () => {
		expect(() =>
			validateResponseOutputContract(
				ctx,
				strictDegradedContract(),
				response('{"ok":true}'),
			),
		).not.toThrow();
	});

	test("does not enforce JSON Schema semantics after json_schema is downgraded", () => {
		expect(() =>
			validateResponseOutputContract(
				ctx,
				strictDegradedContract(),
				response('{"schema":"not enforced"}'),
			),
		).not.toThrow();
	});

	test("does not validate non-strict degraded json_schema output", () => {
		const contract = degradedContract(false);

		expect(contract.requiresValidJson).toBe(false);
		expect(() =>
			validateResponseOutputContract(ctx, contract, response("not json")),
		).not.toThrow();
	});

	test("adds invalid output diagnostic to context when validation fails", () => {
		const diagnostics: unknown[] = [];
		const diagnosticCtx = {
			resolved: { provider: "deepseek", model: "deepseek-v4-flash" },
			addDiagnostic: (diagnostic: unknown) => diagnostics.push(diagnostic),
		} as unknown as ResponsesContext;

		expect(() =>
			validateResponseOutputContract(
				diagnosticCtx,
				strictDegradedContract(),
				response("not json"),
			),
		).toThrow(GodeXError);

		expect(diagnostics).toEqual([
			{
				code: BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
				severity: "error",
				path: "response.output_text",
				action: "rejected",
				message:
					"Response output is not valid JSON for strict downgraded json_schema.",
				metadata: {
					provider: "deepseek",
					model: "deepseek-v4-flash",
					response_id: "resp_test",
				},
			},
		]);
	});
});
