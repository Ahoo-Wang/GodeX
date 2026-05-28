import { describe, expect, test } from "bun:test";
import { jsonSchemaOutputContractMessage } from "./json-schema-output-contract";

describe("jsonSchemaOutputContractMessage", () => {
	test("uses schema-agnostic JSON wording", () => {
		const message = jsonSchemaOutputContractMessage({
			type: "json_schema",
			name: "items",
			schema: {
				type: "array",
				items: { type: "string" },
			},
		});

		expect(message).toContain(
			"Return only JSON that conforms to the JSON Schema below.",
		);
		expect(message).toContain(
			"Output exactly one JSON value and nothing else.",
		);
		expect(message).not.toContain("JSON object");
	});
});
