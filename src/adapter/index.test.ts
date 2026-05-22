import { describe, expect, test } from "bun:test";
import { instructionsToSystemMessage } from "./message-utils";

describe("instructionsToSystemMessage", () => {
	test("converts string instructions to system message", () => {
		const msg = instructionsToSystemMessage("You are helpful.");
		expect(msg).toEqual({ role: "system", content: "You are helpful." });
	});

	test("returns null for empty/undefined instructions", () => {
		expect(instructionsToSystemMessage(undefined)).toBeNull();
		expect(instructionsToSystemMessage("")).toBeNull();
	});
});
