import { describe, expect, test } from "bun:test";
import { responseRequestEchoFields } from "../../adapter/response-utils";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { createLogger } from "../../logger";
import { buildChatResponseObject } from "./response-object";

function ctx(): ResponsesContext {
	return {
		request: {
			model: "gpt-4o",
			input: "Hello",
			store: false,
			metadata: { tenant: "test" },
		} as never,
		resolved: { provider: "openai", model: "gpt-4o" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: {
			name: "openai",
			mapper: {} as never,
			client: {} as never,
		},
	} as unknown as ResponsesContext;
}

describe("buildChatResponseObject", () => {
	test("builds the shared Responses envelope with request echo fields", () => {
		const responsesCtx = ctx();
		const response = buildChatResponseObject(
			responsesCtx,
			{ status: "completed" },
			{
				output: [],
				outputText: "",
				usage: null,
				completedAt: 123,
			},
		);

		expect(response).toEqual({
			id: "resp_1",
			object: "response",
			created_at: responsesCtx.createdAt,
			status: "completed",
			model: responsesCtx.resolved.model,
			output: [],
			output_text: "",
			usage: null,
			completed_at: 123,
			...responseRequestEchoFields(responsesCtx),
		});
	});
});
