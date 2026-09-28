import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "./diagnostic";

describe("CompatibilityDiagnostic", () => {
	test("accepts valid diagnostic with required fields", () => {
		const diagnostic: CompatibilityDiagnostic = {
			code: "bridge.tool.unsupported",
			severity: "warn",
			action: "ignored",
			message: "Tool type not supported",
		};

		expect(diagnostic.code).toBe("bridge.tool.unsupported");
		expect(diagnostic.severity).toBe("warn");
		expect(diagnostic.action).toBe("ignored");
	});

	test("accepts optional path and metadata", () => {
		const diagnostic: CompatibilityDiagnostic = {
			code: "bridge.input.unsupported",
			severity: "info",
			path: "input[2].content[0]",
			action: "ignored",
			message: "Input type not supported",
			metadata: { inputType: "image_url" },
		};

		expect(diagnostic.path).toBe("input[2].content[0]");
		expect(diagnostic.metadata).toEqual({ inputType: "image_url" });
	});
});
