import { describe, expect, test } from "bun:test";
import { extractChoiceReasoningContent } from "./reasoning-content";

describe("extractChoiceReasoningContent", () => {
	test("returns reasoning_content when present on a choice message", () => {
		expect(
			extractChoiceReasoningContent({
				message: { reasoning_content: "thinking" },
			}),
		).toBe("thinking");
	});

	test.each([
		["missing choice", undefined],
		["null choice", null],
		["choice without message", {}],
		["null message", { message: null }],
		["message without reasoning", { message: {} }],
		["empty reasoning", { message: { reasoning_content: "" } }],
		["non-string reasoning", { message: { reasoning_content: 1 } }],
	])("returns undefined for %s", (_, choice) => {
		expect(extractChoiceReasoningContent(choice)).toBeUndefined();
	});
});
