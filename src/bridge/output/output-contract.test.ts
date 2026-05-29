import { describe, expect, test } from "bun:test";
import type { ResponseFormatTextConfig } from "../../protocol/openai/shared";
import {
	type OutputContractResponseFormatDecision,
	planOutputContract,
} from "./output-contract";

const jsonSchemaFormat: ResponseFormatTextConfig = {
	type: "json_schema",
	name: "payload",
	description: "A payload object.",
	schema: {
		type: "object",
		required: ["ok"],
		properties: {
			ok: { type: "boolean" },
		},
	},
	strict: true,
};

const degradedDecision: OutputContractResponseFormatDecision = {
	action: "degraded",
	effectiveValue: { type: "json_object" },
};

describe("planOutputContract", () => {
	test("degrades strict json_schema to json_object and requires valid JSON", () => {
		const plan = planOutputContract({
			format: jsonSchemaFormat,
			responseFormatDecision: degradedDecision,
		});

		expect(plan.requested).toBe(jsonSchemaFormat);
		expect(plan.providerResponseFormat).toEqual({ type: "json_object" });
		expect(plan.requiresValidJson).toBe(true);
		expect(plan.syntheticInstruction).toContain("Return only valid JSON");
		expect(plan.syntheticInstruction).not.toContain(
			"conforms to the JSON Schema",
		);
		expect(plan.syntheticInstruction).toContain('"ok"');
	});

	test("degrades non-strict json_schema without requiring valid JSON", () => {
		const plan = planOutputContract({
			format: {
				...jsonSchemaFormat,
				strict: false,
			},
			responseFormatDecision: degradedDecision,
		});

		expect(plan.providerResponseFormat).toEqual({ type: "json_object" });
		expect(plan.syntheticInstruction).toContain("Return only valid JSON");
		expect(plan.requiresValidJson).toBe(false);
	});

	test("keeps native json_schema as the provider format without instruction or validation", () => {
		const plan = planOutputContract({
			format: jsonSchemaFormat,
			responseFormatDecision: { action: "supported" },
		});

		expect(plan.providerResponseFormat).toBe(jsonSchemaFormat);
		expect(plan.syntheticInstruction).toBeUndefined();
		expect(plan.requiresValidJson).toBe(false);
	});

	test("mirrors non-json_schema formats", () => {
		const textFormat = { type: "text" } as const;

		const plan = planOutputContract({ format: textFormat });

		expect(plan.requested).toBe(textFormat);
		expect(plan.providerResponseFormat).toBe(textFormat);
		expect(plan.syntheticInstruction).toBeUndefined();
		expect(plan.requiresValidJson).toBe(false);
	});

	test("does not validate undefined format", () => {
		const plan = planOutputContract({ format: undefined });

		expect(plan.requested).toBeUndefined();
		expect(plan.providerResponseFormat).toBeUndefined();
		expect(plan.syntheticInstruction).toBeUndefined();
		expect(plan.requiresValidJson).toBe(false);
	});
});
