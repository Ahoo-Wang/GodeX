import { describe, expect, test } from "bun:test";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type { ResponseItem } from "../../../protocol/openai/responses";
import { ChatResponseMapper } from "./response-mapper";

interface TestChoice {
	finish_reason?: string | null;
	message?: { content?: string };
}

interface TestResponse {
	choices: TestChoice[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

function ctx(): ResponsesContext {
	return {
		request: { model: "test", input: "Hello", store: false } as never,
		resolved: { provider: "test", model: "upstream-model" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: { mapper: {} as never, client: {} as never },
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

describe("ChatResponseMapper", () => {
	test("builds a Responses envelope from provider parts", () => {
		const output: ResponseItem[] = [
			{
				id: "msg_resp_1",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "Hello" }],
			},
		];
		const mapper = new ChatResponseMapper<TestResponse, TestChoice, string>({
			accessor: {
				firstChoice: (result) => result.choices[0],
				finishReason: (choice) => choice?.finish_reason,
			},
			finishReason: { map: () => ({ status: "completed" }) },
			output: { map: () => output },
			usage: {
				map: (result) =>
					result.usage
						? {
								input_tokens: result.usage.prompt_tokens,
								output_tokens: result.usage.completion_tokens,
								total_tokens: result.usage.total_tokens,
							}
						: undefined,
			},
			outputText: () => "Hello",
			nowSeconds: () => 1_764_000_010,
			emptyChoicesStatus: {
				status: "failed",
				error: { code: "server_error", message: "Empty choices from upstream" },
			},
		});

		expect(
			mapper.map(ctx(), {
				choices: [{ finish_reason: "stop", message: { content: "Hello" } }],
				usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
			}),
		).toMatchObject({
			id: "resp_1",
			object: "response",
			created_at: 1_764_000_000,
			status: "completed",
			model: "upstream-model",
			output,
			output_text: "Hello",
			usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
			completed_at: 1_764_000_010,
			store: false,
		});
	});

	test("returns configured failed response for empty choices", () => {
		const mapper = new ChatResponseMapper<TestResponse, TestChoice, string>({
			accessor: {
				firstChoice: (result) => result.choices[0],
				finishReason: (choice) => choice?.finish_reason,
			},
			finishReason: { map: () => ({ status: "completed" }) },
			output: { map: () => [] },
			usage: { map: () => undefined },
			outputText: () => "",
			nowSeconds: () => 10,
			emptyChoicesStatus: {
				status: "failed",
				error: { code: "server_error", message: "Empty choices from upstream" },
			},
		});

		expect(mapper.map(ctx(), { choices: [] })).toMatchObject({
			status: "failed",
			error: { code: "server_error", message: "Empty choices from upstream" },
			output: [],
			output_text: "",
			usage: null,
			completed_at: 10,
		});
	});
});
