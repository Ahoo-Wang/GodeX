import { describe, expect, test } from "bun:test";
import { BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT, GodeXError } from "../../error";
import { validateOutputContract } from "./output-validator";

const validationInput = {
	requiresValidJson: true,
	outputText: '{"ok":true}',
	provider: "deepseek",
	model: "deepseek-v4-flash",
	responseId: "resp_test",
};

describe("validateOutputContract", () => {
	test("throws GodeXError for invalid strict JSON output", () => {
		try {
			validateOutputContract({
				...validationInput,
				outputText: "not json",
			});
			throw new Error("expected validation to fail");
		} catch (err) {
			expect(err).toBeInstanceOf(GodeXError);
			expect((err as GodeXError).code).toBe(
				BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
			);
			expect((err as GodeXError).context).toEqual({
				provider: "deepseek",
				model: "deepseek-v4-flash",
				response_id: "resp_test",
			});
		}
	});

	test("accepts valid strict JSON output", () => {
		expect(() => validateOutputContract(validationInput)).not.toThrow();
	});

	test.each([
		["array", "[]"],
		["string", '"ok"'],
		["number", "1"],
		["boolean", "true"],
		["null", "null"],
	])("accepts valid JSON primitive value: %s", (_, outputText) => {
		expect(() =>
			validateOutputContract({
				...validationInput,
				outputText,
			}),
		).not.toThrow();
	});

	test("does not parse output when valid JSON is not required", () => {
		expect(() =>
			validateOutputContract({
				...validationInput,
				requiresValidJson: false,
				outputText: "not json",
			}),
		).not.toThrow();
	});

	test("invalid JSON error has the expected code and cause", () => {
		try {
			validateOutputContract({
				...validationInput,
				outputText: "not json",
			});
			throw new Error("expected validation to fail");
		} catch (err) {
			expect(err).toBeInstanceOf(GodeXError);
			expect((err as GodeXError).code).toBe(
				BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
			);
			expect((err as GodeXError).cause).toBeInstanceOf(SyntaxError);
		}
	});
});
