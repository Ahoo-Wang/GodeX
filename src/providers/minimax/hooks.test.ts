import { describe, expect, test } from "bun:test";
import type { ChatCompletionCreateRequest as BridgeRequest } from "../../protocol/openai/completions";
import { minimaxPatchRequest, minimaxStreamDeltas } from "./hooks";
import type { ChatCompletionChunk } from "./protocol";

function bridgeRequest(overrides: Partial<BridgeRequest> = {}): BridgeRequest {
	return {
		model: "MiniMax-M2.7-highspeed",
		messages: [
			{ role: "system", content: "You are a helpful assistant." },
			{ role: "user", content: "Hi" },
		],
		...overrides,
	} as BridgeRequest;
}

function toRecord(value: unknown): Record<string, unknown> {
	return value as Record<string, unknown>;
}

describe("minimaxPatchRequest", () => {
	test("sets reasoning_split to true", () => {
		const result = minimaxPatchRequest(bridgeRequest());
		expect(result.reasoning_split).toBe(true);
	});

	test("converts reasoning_content to reasoning_details on assistant messages", () => {
		const result = minimaxPatchRequest(
			bridgeRequest({
				messages: [
					{ role: "user", content: "Hi" },
					{
						role: "assistant",
						content: "Hello!",
						reasoning_content: "The user is greeting me.",
					},
					{ role: "user", content: "What is 1+1?" },
				],
			} as unknown as BridgeRequest),
		);

		const assistant = toRecord(result.messages[1]);
		expect(assistant.reasoning_details).toEqual([
			{ text: "The user is greeting me." },
		]);
		expect("reasoning_content" in assistant).toBe(false);
		expect(assistant.content).toBe("Hello!");
	});

	test("preserves assistant messages without reasoning_content unchanged", () => {
		const result = minimaxPatchRequest(
			bridgeRequest({
				messages: [
					{ role: "user", content: "Hi" },
					{ role: "assistant", content: "Hello!" },
				],
			} as unknown as BridgeRequest),
		);

		const assistant = toRecord(result.messages[1]);
		expect(assistant).toEqual({ role: "assistant", content: "Hello!" });
	});

	test("does not touch non-assistant messages", () => {
		const result = minimaxPatchRequest(
			bridgeRequest({
				messages: [
					{ role: "system", content: "Be helpful." },
					{ role: "user", content: "Hi" },
					{
						role: "tool" as const,
						tool_call_id: "call_1",
						content: "result",
					},
				],
			} as unknown as BridgeRequest),
		);

		expect(toRecord(result.messages[0])).toEqual({
			role: "system",
			content: "Be helpful.",
		});
		expect(toRecord(result.messages[1])).toEqual({
			role: "user",
			content: "Hi",
		});
		expect(toRecord(result.messages[2])).toEqual({
			role: "tool",
			tool_call_id: "call_1",
			content: "result",
		});
	});

	test("converts max_tokens to max_completion_tokens", () => {
		const result = minimaxPatchRequest(
			bridgeRequest({ max_tokens: 100 } as unknown as BridgeRequest),
		);
		expect(toRecord(result).max_completion_tokens).toBe(100);
		expect("max_tokens" in result).toBe(false);
	});
});

describe("minimaxStreamDeltas", () => {
	test("maps reasoning_details to reasoning deltas", () => {
		const chunk: ChatCompletionChunk = {
			choices: [
				{
					index: 0,
					delta: {
						reasoning_details: [{ text: "Let me think..." }],
					},
				},
			],
		};

		const deltas = minimaxStreamDeltas(chunk);
		expect(deltas).toEqual([{ reasoning: "Let me think..." }]);
	});

	test("maps reasoning_details before content when both arrive together", () => {
		const chunk: ChatCompletionChunk = {
			choices: [
				{
					index: 0,
					delta: {
						content: '{"ok":true}',
						reasoning_details: [{ text: "thinking" }],
					},
				},
			],
		};

		const deltas = minimaxStreamDeltas(chunk);
		expect(deltas).toEqual([
			{ reasoning: "thinking" },
			{ text: '{"ok":true}' },
		]);
	});

	test("ignores empty reasoning_details entries", () => {
		const chunk: ChatCompletionChunk = {
			choices: [
				{
					index: 0,
					delta: {
						reasoning_details: [{ text: "" }],
					},
				},
			],
		};

		const deltas = minimaxStreamDeltas(chunk);
		expect(deltas).toEqual([]);
	});

	test("still maps legacy reasoning_content via shared mapper", () => {
		const chunk: ChatCompletionChunk = {
			choices: [
				{
					index: 0,
					delta: {
						reasoning_content: "legacy thinking",
					},
				},
			],
		};

		const deltas = minimaxStreamDeltas(chunk);
		expect(deltas).toEqual([{ reasoning: "legacy thinking" }]);
	});
});
