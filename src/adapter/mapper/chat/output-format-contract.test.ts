import { describe, expect, test } from "bun:test";
import type { CompatibilityPlan } from "./compatibility-plan";
import { OutputFormatContract } from "./output-format-contract";

const jsonSchemaFormat = {
	type: "json_schema" as const,
	name: "calendar_event",
	description: "Calendar event payload",
	schema: {
		type: "object",
		properties: {
			title: { type: "string" },
		},
		required: ["title"],
		additionalProperties: false,
	},
	strict: true,
};

describe("OutputFormatContract", () => {
	test("creates a synthetic JSON Schema instruction only for degraded schemas", () => {
		const contract = OutputFormatContract.fromRequestFormat(jsonSchemaFormat, {
			responseFormat: {
				action: "degraded",
				effectiveValue: { type: "json_object" },
			},
		} as CompatibilityPlan);

		expect(contract.syntheticInstruction()).toContain(
			"Return only JSON that conforms to the JSON Schema below.",
		);
		expect(contract.syntheticInstruction()).toContain(
			"Schema name: calendar_event",
		);
		expect(contract.syntheticInstruction()).toContain(
			"Schema description: Calendar event payload",
		);
	});

	test("keeps native json_schema requests free of synthetic instructions", () => {
		const contract = OutputFormatContract.fromRequestFormat(jsonSchemaFormat, {
			responseFormat: { action: "supported" },
		} as CompatibilityPlan);

		expect(contract.syntheticInstruction()).toBeUndefined();
	});
});
