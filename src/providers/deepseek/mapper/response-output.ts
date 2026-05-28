import type {
	ChatResponseAccessor,
	ChatResponseOutputMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseItem } from "../../../protocol/openai/responses";
import type { ChatCompletion, FinishReason } from "../protocol/completions";
import { mapDeepSeekToolCall } from "./tool-calls";

export class DeepSeekResponseAccessor
	implements
		ChatResponseAccessor<
			ChatCompletion,
			ChatCompletion["choices"][0],
			FinishReason
		>
{
	firstChoice(
		source: ChatCompletion,
	): ChatCompletion["choices"][0] | undefined {
		return source.choices?.[0];
	}

	finishReason(
		choice: ChatCompletion["choices"][0] | undefined,
	): FinishReason | undefined {
		return choice?.finish_reason;
	}
}

export class DeepSeekResponseOutputMapper
	implements ChatResponseOutputMapper<ChatCompletion>
{
	map(ctx: ResponsesContext, result: ChatCompletion): ResponseItem[] {
		return buildDeepSeekOutputItems(ctx, result);
	}
}

export function buildDeepSeekOutputItems(
	ctx: ResponsesContext,
	deepSeekRes: ChatCompletion,
): ResponseItem[] {
	const choice = deepSeekRes.choices[0];
	const message = choice?.message;
	const output: ResponseItem[] = [];

	if (message?.reasoning_content) {
		output.push({
			id: `rs_${ctx.responseId}`,
			type: "reasoning",
			summary: [{ type: "summary_text", text: message.reasoning_content }],
		});
	}

	if (message?.tool_calls && message.tool_calls.length > 0) {
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content: message.content
				? [{ type: "output_text", text: message.content }]
				: [],
		});
		for (const [index, tc] of message.tool_calls.entries()) {
			output.push(
				mapDeepSeekToolCall(ctx, {
					index,
					id: tc.id || `call_${index}`,
					type: "function",
					name: tc.function.name,
					arguments: tc.function.arguments,
				}),
			);
		}
	} else if (message?.content !== null && message?.content !== undefined) {
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content: [{ type: "output_text", text: message.content }],
		});
	}

	return output;
}
