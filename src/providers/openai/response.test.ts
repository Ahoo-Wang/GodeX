// src/providers/openai/response.test.ts
import { describe, expect, test } from "bun:test";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { createLogger } from "../../logger";
import type {
	ChatCompletion,
	ChatCompletionChoice,
} from "../../protocol/openai/completions";
import { buildResponseObject } from "./response";

function ctx(requestOverrides: Record<string, unknown> = {}): ResponsesContext {
	return {
		request: {
			model: "gpt-4o",
			...requestOverrides,
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

function choice(
	overrides: Partial<ChatCompletionChoice> = {},
): ChatCompletionChoice {
	return {
		index: 0,
		finish_reason: "stop",
		logprobs: null,
		message: {
			role: "assistant",
			content: "Hello! How can I help?",
			refusal: null,
		},
		...overrides,
	} as ChatCompletionChoice;
}

const openAICompletion: ChatCompletion = {
	id: "chatcmpl_1",
	object: "chat.completion",
	created: 1_764_000_001,
	model: "gpt-4o",
	choices: [choice()],
	usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

describe("buildResponseObject", () => {
	test("maps basic text response to completed with output_text", () => {
		const result = buildResponseObject(ctx(), openAICompletion);

		expect(result.id).toBe("resp_1");
		expect(result.object).toBe("response");
		expect(result.status).toBe("completed");
		expect(result.model).toBe("gpt-4o");
		expect(result.output).toHaveLength(1);
		expect(result.output[0]?.type).toBe("message");
		if (result.output[0]?.type === "message") {
			expect(result.output[0]?.role).toBe("assistant");
		}
		expect(result.output_text).toBe("Hello! How can I help?");
	});

	test("maps tool calls to message + function_call items", () => {
		const withToolCalls: ChatCompletion = {
			...openAICompletion,
			choices: [
				choice({
					message: {
						role: "assistant",
						content: null,
						refusal: null,
						tool_calls: [
							{
								type: "function",
								id: "tc_1",
								function: {
									name: "get_weather",
									arguments: '{"city":"Beijing"}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				}),
			],
		};

		const result = buildResponseObject(ctx(), withToolCalls);

		expect(result.output[0]?.type).toBe("message");
		expect(result.output[1]?.type).toBe("function_call");
		if (result.output[1]?.type === "function_call") {
			expect(result.output[1]?.call_id).toBe("tc_1");
			expect(result.output[1]?.name).toBe("get_weather");
			expect(result.output[1]?.arguments).toBe('{"city":"Beijing"}');
		}
	});

	test('maps finish_reason "length" to incomplete (max_output_tokens)', () => {
		const truncated: ChatCompletion = {
			...openAICompletion,
			choices: [
				choice({
					message: {
						role: "assistant",
						content: "Partial answer",
						refusal: null,
					},
					finish_reason: "length",
				}),
			],
		};

		const result = buildResponseObject(ctx(), truncated);

		expect(result.status).toBe("incomplete");
		expect(result.incomplete_details).toEqual({
			reason: "max_output_tokens",
		});
	});

	test('maps finish_reason "content_filter" to incomplete (content_filter)', () => {
		const filtered: ChatCompletion = {
			...openAICompletion,
			choices: [
				choice({
					message: {
						role: "assistant",
						content: null,
						refusal: null,
					},
					finish_reason: "content_filter",
				}),
			],
		};

		const result = buildResponseObject(ctx(), filtered);

		expect(result.status).toBe("incomplete");
		expect(result.incomplete_details).toEqual({
			reason: "content_filter",
		});
	});

	test("maps usage (prompt_tokens→input_tokens, etc.)", () => {
		const result = buildResponseObject(ctx(), openAICompletion);

		expect(result.usage).toEqual({
			input_tokens: 10,
			output_tokens: 5,
			total_tokens: 15,
		});
	});

	test("maps reasoning_content to reasoning item", () => {
		const withReasoning = {
			...openAICompletion,
			choices: [
				{
					...(openAICompletion.choices[0] as unknown as Record<
						string,
						unknown
					>),
					message: {
						...((
							openAICompletion.choices[0] as unknown as Record<string, unknown>
						).message as Record<string, unknown>),
						reasoning_content: "Let me think step by step...",
					},
				},
			],
		} as unknown as ChatCompletion;

		const result = buildResponseObject(ctx(), withReasoning);

		expect(result.output).toHaveLength(2);
		expect(result.output[0]?.type).toBe("reasoning");
		if (result.output[0]?.type === "reasoning") {
			expect(result.output[0]?.summary).toEqual([
				{ type: "summary_text", text: "Let me think step by step..." },
			]);
		}
		expect(result.output[1]?.type).toBe("message");
	});

	test("maps refusal to refusal content part", () => {
		const withRefusal: ChatCompletion = {
			...openAICompletion,
			choices: [
				choice({
					message: {
						role: "assistant",
						content: "I cannot do that.",
						refusal: "Content policy violation.",
					},
				}),
			],
		};

		const result = buildResponseObject(ctx(), withRefusal);

		expect(result.output).toHaveLength(1);
		expect(result.output[0]?.type).toBe("message");
		if (result.output[0]?.type === "message") {
			const content = result.output[0].content as unknown as Array<
				Record<string, unknown>
			>;
			expect(content).toHaveLength(2);
			expect(content).toContainEqual({
				type: "output_text",
				text: "I cannot do that.",
			});
			expect(content).toContainEqual({
				type: "refusal",
				refusal: "Content policy violation.",
			});
		}
	});

	test("maps annotations to URL citations", () => {
		const withAnnotations: ChatCompletion = {
			...openAICompletion,
			choices: [
				choice({
					message: {
						role: "assistant",
						content: "See this link for details.",
						refusal: null,
						annotations: [
							{
								type: "url_citation",
								url_citation: {
									start_index: 4,
									end_index: 8,
									title: "Example",
									url: "https://example.com",
								},
							},
						],
					},
				}),
			],
		};

		const result = buildResponseObject(ctx(), withAnnotations);

		expect(result.output).toHaveLength(1);
		expect(result.output[0]?.type).toBe("message");
		if (result.output[0]?.type === "message") {
			const content = result.output[0].content as unknown as Array<
				Record<string, unknown>
			>;
			expect(content).toHaveLength(1);
			const textPart = content[0] as Record<string, unknown>;
			expect(textPart.type).toBe("output_text");
			expect(textPart.annotations).toEqual([
				{
					type: "url_citation",
					start_index: 4,
					end_index: 8,
					title: "Example",
					url: "https://example.com",
				},
			]);
		}
	});

	test("returns failed status for empty choices array", () => {
		const emptyChoices: ChatCompletion = {
			...openAICompletion,
			choices: [],
		};

		const result = buildResponseObject(ctx(), emptyChoices);

		expect(result.status).toBe("failed");
		expect(result.output).toEqual([]);
		expect(result.output_text).toBe("");
		expect(result.usage).toBeNull();
	});

	test("includes refusal in message when tool_calls and refusal both present", () => {
		const withToolCallsAndRefusal: ChatCompletion = {
			...openAICompletion,
			choices: [
				choice({
					message: {
						role: "assistant",
						content: "Sure, here's the info.",
						refusal: "Cannot share sensitive data.",
						tool_calls: [
							{
								type: "function",
								id: "tc_1",
								function: {
									name: "get_data",
									arguments: '{"q":"sales"}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				}),
			],
		};

		const result = buildResponseObject(ctx(), withToolCallsAndRefusal);

		const msgItem = result.output[0];
		expect(msgItem?.type).toBe("message");
		if (msgItem?.type === "message") {
			const content = msgItem.content as unknown as Array<
				Record<string, unknown>
			>;
			expect(content).toContainEqual({
				type: "refusal",
				refusal: "Cannot share sensitive data.",
			});
		}
	});

	test("maps usage with detailed token breakdowns", () => {
		const withDetailedUsage: ChatCompletion = {
			...openAICompletion,
			usage: {
				prompt_tokens: 100,
				completion_tokens: 50,
				total_tokens: 150,
				prompt_tokens_details: { cached_tokens: 40 },
				completion_tokens_details: { reasoning_tokens: 20 },
			},
		};

		const result = buildResponseObject(ctx(), withDetailedUsage);

		expect(result.usage).toEqual({
			input_tokens: 100,
			output_tokens: 50,
			total_tokens: 150,
			input_tokens_details: { cached_tokens: 40 },
			output_tokens_details: { reasoning_tokens: 20 },
		});
	});
});
