import { describe, expect, test } from "bun:test";
import { BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT, GodeXError } from "../../error";
import type { ResponseUsage } from "../../protocol/openai/responses";
import { reconstructResponseObject } from "./response-reconstructor";

interface ExampleChoice {
	readonly finish_reason?: string | null;
}

interface ExampleResponse {
	readonly choices?: ExampleChoice[];
	readonly reasoningText?: string;
	readonly text: string;
	readonly usage: ResponseUsage | null;
}

const usage: ResponseUsage = {
	input_tokens: 7,
	output_tokens: 11,
	total_tokens: 18,
};

const accessor = {
	firstChoice(response: ExampleResponse): ExampleChoice | undefined {
		return response.choices?.[0];
	},
	finishReason(response: ExampleResponse): string | undefined {
		return response.choices?.[0]?.finish_reason ?? undefined;
	},
	outputText(response: ExampleResponse): string {
		return response.text;
	},
	reasoningText(response: ExampleResponse): string | undefined {
		return response.reasoningText;
	},
	usage(response: ExampleResponse): ResponseUsage | null {
		return response.usage;
	},
};

function providerResponse(
	finishReason = "stop",
	text = "hello",
): ExampleResponse {
	return {
		choices: [{ finish_reason: finishReason }],
		text,
		usage,
	};
}

function providerResponseWithFinishReason(
	finishReason: string | null | undefined,
	text = "hello",
): ExampleResponse {
	return {
		choices: [{ finish_reason: finishReason }],
		text,
		usage,
	};
}

function reconstruct(response: ExampleResponse) {
	return reconstructResponseObject({
		requestId: "req_123",
		responseId: "resp_123",
		createdAt: 1710000000,
		provider: "deepseek",
		model: "deepseek-chat",
		providerResponse: response,
		accessor,
		toolIdentity: undefined,
		outputContract: { requiresValidJson: false },
		completedAt: 1710000000,
	});
}

describe("reconstructResponseObject", () => {
	test("builds a completed response object from provider accessors with usage", () => {
		const response = reconstruct(providerResponse("stop", "hello world"));

		expect(response).toMatchObject({
			id: "resp_123",
			object: "response",
			created_at: 1710000000,
			completed_at: 1710000000,
			status: "completed",
			model: "deepseek-chat",
			output_text: "hello world",
			usage,
			error: null,
			incomplete_details: null,
		});
		expect(response.output).toEqual([
			{
				id: "msg_resp_123",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "hello world" }],
			},
		]);
	});

	test("reconstructs provider reasoning details separately from output text", () => {
		const response = reconstruct({
			choices: [{ finish_reason: "stop" }],
			reasoningText: "thinking",
			text: "answer",
			usage,
		});

		expect(response.output_text).toBe("answer");
		expect(response.output).toEqual([
			{
				id: "rs_resp_123",
				type: "reasoning",
				status: "completed",
				summary: [],
				content: [{ type: "reasoning_text", text: "thinking" }],
			},
			{
				id: "msg_resp_123",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "answer" }],
			},
		]);
	});

	test("uses completion time instead of request creation time", () => {
		const response = reconstructResponseObject({
			requestId: "req_123",
			responseId: "resp_123",
			createdAt: 1710000000,
			completedAt: 1710000012,
			provider: "deepseek",
			model: "deepseek-chat",
			providerResponse: providerResponse("stop", "hello"),
			accessor,
			toolIdentity: undefined,
			outputContract: { requiresValidJson: false },
		});

		expect(response.created_at).toBe(1710000000);
		expect(response.completed_at).toBe(1710000012);
	});

	test("keeps completed assistant message when first choice has empty output text", () => {
		const response = reconstruct(providerResponse("stop", ""));

		expect(response.status).toBe("completed");
		expect(response.output_text).toBe("");
		expect(response.output).toEqual([
			{
				id: "msg_resp_123",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "" }],
			},
		]);
	});

	test("omits invented request echo fields by default", () => {
		const response = reconstruct(providerResponse("stop", "hello"));

		expect("tools" in response).toBeFalse();
		expect("store" in response).toBeFalse();
		expect("stream" in response).toBeFalse();
		expect("metadata" in response).toBeFalse();
		expect("truncation" in response).toBeFalse();
		expect("previous_response_id" in response).toBeFalse();
	});

	test.each([
		["length", "max_output_tokens"],
		["model_context_window_exceeded", "max_output_tokens"],
		["content_filter", "content_filter"],
		["sensitive", "content_filter"],
	] as const)("maps %s finish reason to incomplete %s", (finishReason, incompleteReason) => {
		const response = reconstruct(providerResponse(finishReason));

		expect(response.status).toBe("incomplete");
		expect(response.incomplete_details).toEqual({
			reason: incompleteReason,
		});
		expect(response.error).toBeNull();
		expect(response.output).toEqual([
			{
				id: "msg_resp_123",
				type: "message",
				role: "assistant",
				status: "incomplete",
				content: [{ type: "output_text", text: "hello" }],
			},
		]);
	});

	test.each([
		["undefined", undefined],
		["null", null],
	] as const)("maps %s finish reason to failed response", (_, finishReason) => {
		const response = reconstruct(
			providerResponseWithFinishReason(finishReason),
		);

		expect(response.status).toBe("failed");
		expect(response.error).toEqual({
			code: "server_error",
			message: "Provider deepseek returned no finish reason.",
		});
		expect(response.incomplete_details).toBeNull();
	});

	test("maps unexpected finish reason to failed response", () => {
		const response = reconstruct(providerResponse("weird_finish"));

		expect(response.status).toBe("failed");
		expect(response.error).toEqual({
			code: "server_error",
			message:
				"Provider deepseek returned unexpected finish reason: weird_finish.",
		});
		expect(response.incomplete_details).toBeNull();
	});

	test.each([
		"stop",
		"tool_calls",
	] as const)("maps %s finish reason to completed", (finishReason) => {
		const response = reconstruct(providerResponse(finishReason));

		expect(response.status).toBe("completed");
		expect(response.error).toBeNull();
		expect(response.incomplete_details).toBeNull();
	});

	test("does not reconstruct tool output items for tool_calls finish reason", () => {
		const response = reconstructResponseObject({
			requestId: "req_123",
			responseId: "resp_123",
			createdAt: 1710000000,
			completedAt: 1710000000,
			provider: "deepseek",
			model: "deepseek-chat",
			providerResponse: providerResponse("tool_calls", "tool text"),
			accessor,
			toolIdentity: { reserved: true },
			outputContract: { requiresValidJson: false },
		});

		expect(response.status).toBe("completed");
		expect(response.output).toEqual([
			{
				id: "msg_resp_123",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "tool text" }],
			},
		]);
		expect(response.output.some((item) => item.type === "function_call")).toBe(
			false,
		);
	});

	test("returns failed response when provider returns no choices", () => {
		const response = reconstruct({
			choices: [],
			text: "ignored",
			usage,
		});

		expect(response.status).toBe("failed");
		expect(response.output).toEqual([]);
		expect(response.output_text).toBe("");
		expect(response.usage).toBeNull();
		expect(response.error).toEqual({
			code: "server_error",
			message: "Provider deepseek returned no choices.",
		});
	});

	test("throws BridgeError code when strict JSON output is invalid", () => {
		try {
			reconstructResponseObject({
				requestId: "req_123",
				responseId: "resp_123",
				createdAt: 1710000000,
				completedAt: 1710000000,
				provider: "deepseek",
				model: "deepseek-chat",
				providerResponse: providerResponse("stop", "not json"),
				accessor,
				toolIdentity: undefined,
				outputContract: { requiresValidJson: true },
			});
			throw new Error("expected strict JSON validation to fail");
		} catch (err) {
			expect(err).toBeInstanceOf(GodeXError);
			expect((err as GodeXError).code).toBe(
				BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
			);
		}
	});

	test("accepts valid strict JSON output", () => {
		const response = reconstructResponseObject({
			requestId: "req_123",
			responseId: "resp_123",
			createdAt: 1710000000,
			completedAt: 1710000000,
			provider: "deepseek",
			model: "deepseek-chat",
			providerResponse: providerResponse("stop", '{"ok":true}'),
			accessor,
			toolIdentity: undefined,
			outputContract: { requiresValidJson: true },
		});

		expect(response.status).toBe("completed");
		expect(response.output_text).toBe('{"ok":true}');
	});
});
