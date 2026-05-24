// src/providers/openai/messages.test.ts
import { describe, expect, test } from "bun:test";
import type { ResponseCreateRequest } from "../../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../../session";
import { buildOpenAIMessages } from "./messages";

function req(partial: Partial<ResponseCreateRequest> = {}) {
	return { model: "gpt-4o", ...partial } as ResponseCreateRequest;
}

function asUserContent(msg: unknown): Array<Record<string, unknown>> {
	return (msg as { content: unknown }).content as Array<
		Record<string, unknown>
	>;
}

describe("buildOpenAIMessages", () => {
	test("converts string input to user message", () => {
		const messages = buildOpenAIMessages(req({ input: "Hello" }), null);
		expect(messages).toEqual([{ role: "user", content: "Hello" }]);
	});

	test("maps instructions to developer message (not system)", () => {
		const messages = buildOpenAIMessages(
			req({ input: "Hi", instructions: "Be helpful." }),
			null,
		);
		expect(messages[0]).toEqual({ role: "developer", content: "Be helpful." });
		expect(messages[1]).toEqual({ role: "user", content: "Hi" });
	});

	test("converts array input items to messages", () => {
		const messages = buildOpenAIMessages(
			req({
				input: [
					{ role: "user", content: "Hi" },
					{ role: "assistant", content: "Hello!" },
					{ role: "user", content: "How are you?" },
				],
			}),
			null,
		);
		expect(messages).toEqual([
			{ role: "user", content: "Hi" },
			{ role: "assistant", content: "Hello!" },
			{ role: "user", content: "How are you?" },
		]);
	});

	test("preserves developer role (not downgraded to system)", () => {
		const messages = buildOpenAIMessages(
			req({
				input: [
					{ role: "developer", content: "Act as a poet." },
					{ role: "user", content: "Write a haiku." },
				],
			}),
			null,
		);
		expect(messages[0]).toEqual({
			role: "developer",
			content: "Act as a poet.",
		});
		expect(messages[1]).toEqual({ role: "user", content: "Write a haiku." });
	});

	test("maps function call output to tool message with tool_call_id", () => {
		const messages = buildOpenAIMessages(
			req({
				input: [
					{
						type: "function_call_output",
						call_id: "call_weather",
						output: '{"temperature":21}',
					},
				],
			}),
			null,
		);
		expect(messages[0]).toEqual({
			role: "tool",
			content: '{"temperature":21}',
			tool_call_id: "call_weather",
		});
	});

	test("maps function call to assistant message with tool_calls", () => {
		const messages = buildOpenAIMessages(
			req({
				input: [
					{
						type: "function_call",
						call_id: "call_weather",
						name: "get_weather",
						arguments: '{"city":"Beijing"}',
					},
				],
			}),
			null,
		);
		expect(messages[0]).toEqual({
			role: "assistant",
			content: "",
			tool_calls: [
				{
					type: "function",
					id: "call_weather",
					function: {
						name: "get_weather",
						arguments: '{"city":"Beijing"}',
					},
				},
			],
		});
	});

	test("maps multimodal user content (input_text + input_image) to content parts", () => {
		const messages = buildOpenAIMessages(
			req({
				input: [
					{
						role: "user",
						content: [
							{ type: "input_text", text: "What is in this image?" },
							{
								type: "input_image",
								image_url: "https://example.com/cat.png",
							},
						],
					},
				],
			}),
			null,
		);

		expect(messages).toHaveLength(1);
		const content = asUserContent(messages[0]);
		expect(content).toHaveLength(2);
		expect(content[0]).toEqual({
			type: "text",
			text: "What is in this image?",
		});
		expect(content[1]).toEqual({
			type: "image_url",
			image_url: { url: "https://example.com/cat.png" },
		});
	});

	test("maps input_file to file content part", () => {
		const messages = buildOpenAIMessages(
			req({
				input: [
					{
						role: "user",
						content: [
							{
								type: "input_file",
								file_data: "data:text/plain;base64,aGVsbG8=",
								filename: "hello.txt",
							},
						],
					},
				],
			}),
			null,
		);

		expect(messages).toHaveLength(1);
		const content = asUserContent(messages[0]);
		expect(content).toHaveLength(1);
		expect(content[0]).toEqual({
			type: "file",
			file: {
				file_data: "data:text/plain;base64,aGVsbG8=",
				filename: "hello.txt",
			},
		});
	});

	test("maps input_audio to input_audio content part", () => {
		const messages = buildOpenAIMessages(
			req({
				input: [
					{
						role: "user",
						content: [
							{
								type: "input_audio",
								data: "d2F2ZSBkYXRh",
								format: "wav",
							},
						],
					},
				],
			} as Record<string, unknown> as ResponseCreateRequest),
			null,
		);

		expect(messages).toHaveLength(1);
		const content = asUserContent(messages[0]);
		expect(content).toHaveLength(1);
		expect(content[0]).toEqual({
			type: "input_audio",
			input_audio: {
				data: "d2F2ZSBkYXRh",
				format: "wav",
			},
		});
	});

	test("prepends session history before current input", () => {
		const session: ResponseSessionSnapshot = {
			previous_response_id: "resp_prev",
			turns: [],
			input_items: [
				{
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "First" }],
				},
				{
					type: "message",
					role: "assistant",
					status: "completed",
					id: "msg_1",
					content: [{ type: "output_text", text: "Reply" }],
				},
			],
		};

		const messages = buildOpenAIMessages(
			req({ input: "Follow-up", previous_response_id: "resp_prev" }),
			session,
		);

		expect(messages[0]).toEqual({
			role: "user",
			content: [{ type: "text", text: "First" }],
		});
		expect(messages[1]).toEqual({ role: "assistant", content: "Reply" });
		expect(messages[2]).toEqual({ role: "user", content: "Follow-up" });
	});
});
