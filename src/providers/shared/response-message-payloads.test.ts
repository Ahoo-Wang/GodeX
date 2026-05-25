import { describe, expect, test } from "bun:test";
import { AdapterError } from "../../error";
import type { ResponseItem } from "../../protocol/openai/responses";
import {
	downgradedResponseToolCallPayload,
	downgradedResponseToolOutputPayload,
	extractResponseText,
	responseFunctionOutputPayload,
} from "./response-message-payloads";

const throwOptions = {
	provider: "test-provider",
	onUnsupported: "throw" as const,
};

describe("response message payload helpers", () => {
	test("preserves zero-valued shell call arguments", () => {
		const payload = downgradedResponseToolCallPayload({
			type: "shell_call",
			call_id: "call_shell",
			action: {
				commands: ["pwd"],
				timeout_ms: 0,
				max_output_length: 0,
			},
			status: "completed",
		} as ResponseItem);

		expect(payload).toEqual({
			callId: "call_shell",
			name: "shell",
			argumentsValue: {
				commands: ["pwd"],
				timeout_ms: 0,
				max_output_length: 0,
			},
		});
	});

	test("converts function output content parts to text", () => {
		const payload = responseFunctionOutputPayload(
			{
				type: "function_call_output",
				call_id: "call_weather",
				output: [{ type: "input_text", text: "sunny" }],
			},
			throwOptions,
		);

		expect(payload).toEqual({
			callId: "call_weather",
			content: "sunny",
		});
	});

	test("formats shell output chunks as provider-neutral tool output text", () => {
		const payload = downgradedResponseToolOutputPayload(
			{
				type: "shell_call_output",
				call_id: "call_shell",
				output: [
					{
						stdout: "ok\n",
						stderr: "",
						outcome: { type: "exit", exit_code: 0 },
					},
				],
			},
			throwOptions,
		);

		expect(payload).toEqual({
			callId: "call_shell",
			content: "[exit 0]\nstdout:\nok\n\nstderr:\n",
		});
	});

	test("throws provider-scoped errors for unsupported current content", () => {
		expect(() =>
			extractResponseText([{ type: "input_image", image_url: "x" }], {
				provider: "zhipu",
				onUnsupported: "throw",
			}),
		).toThrow(AdapterError);
	});
});
