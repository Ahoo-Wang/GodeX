import { describe, expect, test } from "bun:test";
import { ServerError } from "../error";
import { parseModelSelector } from "./model-selector";

function expectServerErrorCode(fn: () => unknown, code: string): void {
	try {
		fn();
		throw new Error(`Expected ServerError ${code}`);
	} catch (err) {
		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(code);
	}
}

describe("parseModelSelector", () => {
	test("rejects missing and whitespace-only selectors", () => {
		for (const value of [undefined, null, " "]) {
			expectServerErrorCode(
				() => parseModelSelector(value),
				"server.request.missing_model",
			);
		}
	});

	test("rejects non-string selectors", () => {
		expectServerErrorCode(
			() => parseModelSelector(42),
			"server.request.invalid_parameter",
		);
	});

	test("parses trimmed bare selectors", () => {
		expect(parseModelSelector("  gpt-5  ")).toEqual({
			kind: "bare",
			selector: "gpt-5",
			model: "gpt-5",
		});
	});

	test("parses provider-qualified selectors", () => {
		expect(parseModelSelector(" zhipu/glm-5.1 ")).toEqual({
			kind: "provider_model",
			selector: "zhipu/glm-5.1",
			resolved: { provider: "zhipu", model: "glm-5.1" },
		});
	});

	test("allows extra separators inside provider-qualified model segment", () => {
		expect(parseModelSelector("custom/fine_tuned/model")).toEqual({
			kind: "provider_model",
			selector: "custom/fine_tuned/model",
			resolved: { provider: "custom", model: "fine_tuned/model" },
		});
	});

	test("rejects provider-qualified selectors with empty segments", () => {
		for (const value of ["/glm-5.1", "zhipu/"]) {
			expectServerErrorCode(
				() => parseModelSelector(value),
				"server.request.invalid_parameter",
			);
		}
	});
});
