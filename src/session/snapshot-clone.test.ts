import { describe, expect, test } from "bun:test";
import { cloneStoredResponseSession } from "./snapshot-clone";
import { completedTurn } from "./test-fixtures";

describe("cloneStoredResponseSession", () => {
	test("returns a deep clone of a stored response session", () => {
		const session = completedTurn("resp_clone", null);
		const cloned = cloneStoredResponseSession(session);

		expect(cloned).toEqual(session);
		expect(cloned).not.toBe(session);
		expect(cloned.request).not.toBe(session.request);
		expect(cloned.response).not.toBe(session.response);
		expect(cloned.response.output).not.toBe(session.response.output);
	});
});
