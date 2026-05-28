import type {
	ChatResponseAccessor,
	ChatResponseOutputMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseItem } from "../../../protocol/openai/responses";
import type {
	ChatCompletionResponse,
	FinishReason,
} from "../protocol/completions";
import { mapZhipuToolCall } from "./tool-calls";

export class ZhipuResponseAccessor
	implements
		ChatResponseAccessor<
			ChatCompletionResponse,
			ChatCompletionResponse["choices"][0],
			FinishReason
		>
{
	firstChoice(
		source: ChatCompletionResponse,
	): ChatCompletionResponse["choices"][0] | undefined {
		return source.choices?.[0];
	}

	finishReason(
		choice: ChatCompletionResponse["choices"][0] | undefined,
	): FinishReason | null | undefined {
		return choice?.finish_reason;
	}
}

export class ZhipuResponseOutputMapper
	implements ChatResponseOutputMapper<ChatCompletionResponse>
{
	map(ctx: ResponsesContext, result: ChatCompletionResponse): ResponseItem[] {
		return buildZhipuOutputItems(ctx, result);
	}
}

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
		const sources = zhipuRes.web_search
			.map((result) => result.link)
			.filter((url): url is string => typeof url === "string" && url.length > 0)
			.map((url) => ({ type: "url" as const, url }));
		output.push({
			id: `ws_${ctx.responseId}`,
			type: "web_search_call",
			action: {
				type: "search",
				query: "",
				...(sources.length > 0 ? { sources } : {}),
			},
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
					type: "function",
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
