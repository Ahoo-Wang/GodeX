import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseObject } from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import { saveResponseSession } from "./response-session-persistence";

function createMockSessionStore(): ResponseSessionStore & {
	saved: StoredResponseSession[];
} {
	const saved: StoredResponseSession[] = [];
	return {
		saved,
		get: async () => null,
		save: async (session: StoredResponseSession) => {
			saved.push(session);
		},
		resolveChain: async () =>
			({
				previous_response_id: "none",
				turns: [],
				input_items: [],
			}) as never,
		delete: async () => {},
	};
}

function createMockCtx(
	store: boolean,
	loggerOverrides: Partial<ResponsesContext["logger"]> = {},
): ResponsesContext {
	const logger: ResponsesContext["logger"] = {
		info: () => {},
		debug: () => {},
		trace: () => {},
		error: () => {},
		warn: () => {},
		...loggerOverrides,
	} as ResponsesContext["logger"];

	return {
		request: {
			store,
			previous_response_id: "resp_previous",
			input: [{ type: "message", role: "user", content: "hello" }],
			instructions: "Be concise",
			model: "mock/gpt-test",
			tools: [
				{ type: "function", name: "lookup", parameters: {}, strict: true },
			],
			tool_choice: "auto",
			parallel_tool_calls: true,
			truncation: "auto",
		},
		logger,
	} as unknown as ResponsesContext;
}

const responseObject: ResponseObject = {
	id: "resp_saved",
	object: "response",
	status: "incomplete",
	model: "gpt-test",
	created_at: 11,
	completed_at: 22,
	output: [
		{
			type: "message",
			id: "msg_1",
			status: "completed",
			role: "assistant",
			content: [{ type: "output_text", text: "done", annotations: [] }],
		},
	],
	output_text: "done",
	usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
	error: null,
	incomplete_details: { reason: "max_output_tokens" },
};

describe("saveResponseSession", () => {
	test("saves the stored session payload used for response replay", async () => {
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(true);

		await saveResponseSession(sessionStore, responseObject, ctx);

		expect(sessionStore.saved).toEqual([
			{
				id: "resp_saved",
				previous_response_id: "resp_previous",
				created_at: 11,
				completed_at: 22,
				status: "incomplete",
				request: {
					input: [{ type: "message", role: "user", content: "hello" }],
					instructions: "Be concise",
					model: "mock/gpt-test",
					tools: [
						{ type: "function", name: "lookup", parameters: {}, strict: true },
					],
					tool_choice: "auto",
					parallel_tool_calls: true,
					truncation: "auto",
				},
				response: {
					id: "resp_saved",
					output: responseObject.output,
					output_text: "done",
					usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
					error: null,
					incomplete_details: { reason: "max_output_tokens" },
				},
			},
		]);
	});

	test("coalesces missing previous and completed timestamps to null", async () => {
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(true);
		ctx.request.previous_response_id = undefined;
		const responseWithoutCompletedAt = {
			...responseObject,
			completed_at: undefined,
		};

		await saveResponseSession(sessionStore, responseWithoutCompletedAt, ctx);

		expect(sessionStore.saved[0]?.previous_response_id).toBeNull();
		expect(sessionStore.saved[0]?.completed_at).toBeNull();
	});

	test("skips persistence when response storage is disabled", async () => {
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(false);

		await saveResponseSession(sessionStore, responseObject, ctx);

		expect(sessionStore.saved).toEqual([]);
	});

	test("logs after successful persistence", async () => {
		const sessionStore = createMockSessionStore();
		const logs: Array<{ event: string; attr: Record<string, unknown> }> = [];
		const ctx = createMockCtx(true, {
			debug: (event, attr) => {
				logs.push({
					event,
					attr: typeof attr === "function" ? attr() : (attr ?? {}),
				});
			},
		});

		await saveResponseSession(sessionStore, responseObject, ctx);

		expect(logs).toEqual([
			{ event: "session.saved", attr: { response_id: "resp_saved" } },
		]);
	});

	test("propagates store failures to the caller", async () => {
		const sessionStore = createMockSessionStore();
		sessionStore.save = async () => {
			throw new Error("write failed");
		};
		const ctx = createMockCtx(true);

		await expect(
			saveResponseSession(sessionStore, responseObject, ctx),
		).rejects.toThrow("write failed");
	});
});
