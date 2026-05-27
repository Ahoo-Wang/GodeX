import { describe, expect, test } from "bun:test";
import { SESSION_CHAIN_NOT_FOUND, SessionError } from "../error";
import type {
	ResponseSessionSnapshot,
	ResponseSessionStore,
	StoredResponseSession,
} from "../session";
import { resolveResponsesSession } from "./responses-session";
import { type CapturedLog, createCapturingLogger } from "./test-fixtures";

const completedTurn = {
	id: "resp_parent",
	previous_response_id: null,
	created_at: 1_764_000_000,
	completed_at: 1_764_000_001,
	status: "completed",
	request: {
		input: "Hello",
		model: "glm-5.1",
	},
	response: {
		id: "resp_parent",
		output: [],
	},
} satisfies StoredResponseSession;

const snapshot = {
	previous_response_id: "resp_parent",
	turns: [completedTurn],
	input_items: [],
} satisfies ResponseSessionSnapshot;

function createStore(
	resolveChain: ResponseSessionStore["resolveChain"],
): ResponseSessionStore {
	return {
		async get() {
			return null;
		},
		async save() {},
		resolveChain,
		async delete() {},
	};
}

describe("resolveResponsesSession", () => {
	test("returns null when no previous_response_id is present", async () => {
		let resolveCalls = 0;
		const app = {
			sessionStore: createStore(async () => {
				resolveCalls++;
				return snapshot;
			}),
		};
		const logger = createCapturingLogger([]);

		const session = await resolveResponsesSession(
			app as never,
			{ model: "zhipu/glm-5.1", input: "hi" },
			logger,
		);

		expect(session).toBeNull();
		expect(resolveCalls).toBe(0);
	});

	test("resolves previous_response_id and logs the chain length", async () => {
		const logs: CapturedLog[] = [];
		const logger = createCapturingLogger(logs);
		const calls: string[] = [];
		const app = {
			sessionStore: createStore(async (previousResponseId) => {
				calls.push(previousResponseId);
				return snapshot;
			}),
		};

		const session = await resolveResponsesSession(
			app as never,
			{
				model: "zhipu/glm-5.1",
				input: "hi",
				previous_response_id: "resp_parent",
			},
			logger,
		);

		expect(session).toBe(snapshot);
		expect(calls).toEqual(["resp_parent"]);
		expect(logs).toContainEqual({
			level: "debug",
			event: "session.chain.resolved",
			attr: {
				previous_response_id: "resp_parent",
				turnCount: 1,
			},
		});
	});

	test("propagates session store errors unchanged", async () => {
		const expected = new SessionError(
			SESSION_CHAIN_NOT_FOUND,
			"Previous response was not found.",
			{ responseId: "resp_missing" },
		);
		const app = {
			sessionStore: createStore(async () => {
				throw expected;
			}),
		};

		await expect(
			resolveResponsesSession(
				app as never,
				{
					model: "zhipu/glm-5.1",
					input: "hi",
					previous_response_id: "resp_missing",
				},
				createCapturingLogger([]),
			),
		).rejects.toBe(expected);
	});
});
