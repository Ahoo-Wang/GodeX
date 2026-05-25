// src/providers/zhipu/response.ts

import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseItem,
	ResponseObject,
	ResponseOutputMessage,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { ChatCompletionResponse } from "./protocol/completions";
import { buildZhipuResponseObject, zhipuStatusFields } from "./response-common";
import { mapZhipuToolCall } from "./tool-calls";

export function buildZhipuOutputItems(
	ctx: ResponsesContext,
	zhipuRes: ChatCompletionResponse,
): ResponseItem[] {
	const choice = zhipuRes.choices[0];
	const message = choice?.message;
	const output: ResponseItem[] = [];

	if (message?.reasoning_content) {
		output.push({
			id: `rs_${ctx.responseId}`,
			type: "reasoning",
			summary: [{ type: "summary_text", text: message.reasoning_content }],
		});
	}

	if (zhipuRes.web_search && zhipuRes.web_search.length > 0) {
		output.push({
			id: `ws_${ctx.responseId}`,
			type: "web_search_call",
			action: { type: "search", query: "" },
			status: "completed",
		});
	}

	if (message?.tool_calls && message.tool_calls.length > 0) {
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content: message.content
				? [
						{
							type: "output_text",
							text: typeof message.content === "string" ? message.content : "",
						},
					]
				: [],
		});
		for (const [index, tc] of message.tool_calls.entries()) {
			output.push(
				mapZhipuToolCall(ctx, {
					index,
					id: tc.id || `call_${index}`,
					name: tc.function?.name ?? "",
					arguments: tc.function?.arguments ?? "",
				}),
			);
		}
	} else if (message?.content !== null && message?.content !== undefined) {
		const text =
			typeof message.content === "string"
				? message.content
				: Array.isArray(message.content)
					? message.content
							.map((p) => (p.type === "text" ? p.text : ""))
							.join("")
					: "";

		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content: [{ type: "output_text", text }],
		});
	}

	return output;
}

function extractOutputText(output: ResponseItem[]): string {
	return output
		.filter(
			(item): item is ResponseOutputMessage =>
				item.type === "message" && "content" in item,
		)
		.flatMap((item) => item.content)
		.filter(
			(part): part is { type: "output_text"; text: string } =>
				typeof part === "object" &&
				part !== null &&
				"type" in part &&
				part.type === "output_text",
		)
		.map((part) => part.text)
		.join("");
}

function mapZhipuUsage(
	zhipuRes: ChatCompletionResponse,
): ResponseUsage | undefined {
	if (!zhipuRes.usage) return undefined;
	return {
		input_tokens: zhipuRes.usage.prompt_tokens,
		output_tokens: zhipuRes.usage.completion_tokens,
		total_tokens: zhipuRes.usage.total_tokens,
	};
}

export function buildResponseObject(
	ctx: ResponsesContext,
	zhipuRes: ChatCompletionResponse,
): ResponseObject {
	const choice = zhipuRes.choices[0];
	const output = buildZhipuOutputItems(ctx, zhipuRes);

	return buildZhipuResponseObject(
		ctx,
		zhipuStatusFields(choice?.finish_reason),
		{
			output,
			outputText: extractOutputText(output),
			usage: mapZhipuUsage(zhipuRes) ?? null,
			completedAt: Math.floor(Date.now() / 1000),
		},
	);
}
