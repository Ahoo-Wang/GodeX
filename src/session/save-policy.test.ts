import { describe, expect, test } from "bun:test";
import { SessionError } from "../error";
import { assertCanSaveSession } from "./save-policy";
import { completedTurn } from "./test-fixtures";

describe("assertCanSaveSession", () => {
	test("allows new sessions when no expected parent is supplied", () => {
		expect(() =>
			assertCanSaveSession({
				session: completedTurn("resp_1", null),
				existing: null,
			}),
		).not.toThrow();
	});

	test("allows overwrite when an existing session is present", () => {
		const session = completedTurn("resp_1", null);

		expect(() =>
			assertCanSaveSession({
				session,
				existing: session,
				options: { overwrite: true },
			}),
		).not.toThrow();
	});

	test("rejects duplicate sessions without overwrite", () => {
		const session = completedTurn("resp_1", null);

		expect(() =>
			assertCanSaveSession({
				session,
				existing: session,
			}),
		).toThrow(SessionError);
		expect(() =>
			assertCanSaveSession({
				session,
				existing: session,
			}),
		).toThrow("Response session already exists.");
	});

	test("rejects mismatched expected previous response id", () => {
		const session = completedTurn("resp_1", null);

		expect(() =>
			assertCanSaveSession({
				session,
				existing: null,
				options: { expected_previous_response_id: "resp_parent" },
			}),
		).toThrow(SessionError);
		expect(() =>
			assertCanSaveSession({
				session,
				existing: null,
				options: { expected_previous_response_id: "resp_parent" },
			}),
		).toThrow(
			"Response session parent did not match expected previous response ID.",
		);
	});

	test("uses the existing session conflict code", () => {
		const session = completedTurn("resp_1", null);

		try {
			assertCanSaveSession({ session, existing: session });
			throw new Error("Expected conflict");
		} catch (err) {
			expect(err).toBeInstanceOf(SessionError);
			expect(err).toMatchObject({
				code: "session.store.conflict",
				context: {
					responseId: "resp_1",
				},
			});
		}
	});
});
