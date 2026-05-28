import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../../adapter/compatibility";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type { ResponseCreateRequest } from "../../../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../../../session";
import { describeCurrentInputContentCompatibility } from "../../shared/compatibility-test-suite";
import type { ChatCompletionRequest } from "../protocol/completions";
import { createDeepSeekMapper } from "./index";

function ctx(
	partial: Partial<ResponseCreateRequest>,
	session: ResponseSessionSnapshot | null = null,
): ResponsesContext {
	const diagnostics: CompatibilityDiagnostic[] = [];
	return {
		request: {
			model: "deepseek-v4-flash",
			...partial,
		} as ResponseCreateRequest,
		resolved: { provider: "deepseek", model: "deepseek-v4-flash" },
		session,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as ApplicationContext,
		provider: { name: "deepseek", mapper: {} as never, client: {} as never },
		diagnostics,
		addDiagnostic(d: CompatibilityDiagnostic) {
			diagnostics.push(d);
		},
	} as unknown as ResponsesContext;
}

const requestMapper = createDeepSeekMapper().request;
const mapRequest = (c: ResponsesContext): ChatCompletionRequest =>
	requestMapper.map(c) as ChatCompletionRequest;

function mapMessages(c: ResponsesContext) {
	return mapRequest(c).messages;
}

const mapCompatibilityRequest = (partial: Partial<ResponseCreateRequest>) => {
	const c = ctx(partial);
	return { request: mapRequest(c), diagnostics: c.diagnostics };
};

describeCurrentInputContentCompatibility<ChatCompletionRequest>({
	provider: "DeepSeek",
	mapRequest: mapCompatibilityRequest,
	getUserMessageContent(request) {
		return request.messages.find((message) => message.role === "user")?.content;
	},
});

describe("DeepSeek messages", () => {
	test("maps instructions and string input", () => {
		expect(
			mapMessages(ctx({ instructions: "Be helpful.", input: "Hello" })),
		).toEqual([
			{ role: "system", content: "Be helpful." },
			{ role: "user", content: "Hello" },
		]);
	});

	test("maps developer messages to system", () => {
		expect(
			mapMessages(
				ctx({
					input: [
						{ role: "developer", content: "Use terse answers." },
						{ role: "user", content: "Hi" },
					],
				}),
			),
		).toEqual([
			{ role: "system", content: "Use terse answers." },
			{ role: "user", content: "Hi" },
		]);
	});

	test("coalesces reasoning, assistant text, function calls, and tool outputs in session history", () => {
		const session: ResponseSessionSnapshot = {
			previous_response_id: "resp_prev",
			turns: [],
			input_items: [
				{
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "Weather?" }],
				},
				{
					id: "rs_1",
					type: "reasoning",
					summary: [{ type: "summary_text", text: "Need date then weather." }],
				},
				{
					id: "msg_1",
					type: "message",
					role: "assistant",
					status: "completed",
					content: [{ type: "output_text", text: "Let me check." }],
				},
				{
					type: "function_call",
					call_id: "call_date",
					name: "get_date",
					arguments: "{}",
				},
				{
					type: "function_call_output",
					call_id: "call_date",
					output: "2026-05-26",
				},
			],
		};

		expect(mapMessages(ctx({ input: "Continue" }, session))).toEqual([
			{ role: "user", content: "Weather?" },
			{
				role: "assistant",
				content: "Let me check.",
				reasoning_content: "Need date then weather.",
				tool_calls: [
					{
						id: "call_date",
						type: "function",
						function: { name: "get_date", arguments: "{}" },
					},
				],
			},
			{ role: "tool", content: "2026-05-26", tool_call_id: "call_date" },
			{ role: "user", content: "Continue" },
		]);
	});

	test("does not replay reasoning onto normal assistant replies", () => {
		const session: ResponseSessionSnapshot = {
			previous_response_id: "resp_prev",
			turns: [],
			input_items: [
				{
					id: "rs_1",
					type: "reasoning",
					summary: [{ type: "summary_text", text: "Simple thought." }],
				},
				{
					id: "msg_1",
					type: "message",
					role: "assistant",
					status: "completed",
					content: [{ type: "output_text", text: "Done." }],
				},
			],
		};

		expect(mapMessages(ctx({ input: "Next" }, session))).toEqual([
			{ role: "assistant", content: "Done." },
			{ role: "user", content: "Next" },
		]);
	});

	test("maps stateless function call input arrays with reasoning replay", () => {
		expect(
			mapMessages(
				ctx({
					input: [
						{
							id: "rs_1",
							type: "reasoning",
							summary: [{ type: "summary_text", text: "Need tool." }],
						},
						{
							id: "msg_1",
							type: "message",
							role: "assistant",
							status: "completed",
							content: [],
						},
						{
							type: "function_call",
							call_id: "call_weather",
							name: "weather.now",
							arguments: '{"city":"Beijing"}',
						},
					],
				}),
			),
		).toEqual([
			{
				role: "assistant",
				content: "",
				reasoning_content: "Need tool.",
				tool_calls: [
					{
						id: "call_weather",
						type: "function",
						function: {
							name: "weather_now",
							arguments: '{"city":"Beijing"}',
						},
					},
				],
			},
		]);
	});
});
