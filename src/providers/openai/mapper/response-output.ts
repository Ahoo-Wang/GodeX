import type {
	ChatResponseAccessor,
	ChatResponseOutputMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ChatCompletion,
	ChatCompletionAnnotation,
} from "../../../protocol/openai/completions";
import type {
	ResponseItem,
	ResponseObject,
	ResponseOutputContent,
	URLCitation,
} from "../../../protocol/openai/responses";
import { mapOpenAIResponseToolCall } from "./tool-calls";

export class OpenAIResponseAccessor
	implements
		ChatResponseAccessor<ChatCompletion, ChatCompletion["choices"][0], string>
{
	firstChoice(
		source: ChatCompletion,
	): ChatCompletion["choices"][0] | undefined {
		return source.choices?.[0];
	}

	finishReason(
		choice: ChatCompletion["choices"][0] | undefined,
	): string | null | undefined {
		return choice?.finish_reason;
	}
}

export class OpenAIResponseOutputMapper
	implements ChatResponseOutputMapper<ChatCompletion>
{
	map(ctx: ResponsesContext, result: ChatCompletion): ResponseObject["output"] {
		return buildOutputItems(ctx, result);
	}
}

export function buildOutputItems(
	ctx: ResponsesContext,
	openAIRes: ChatCompletion,
): ResponseItem[] {
	const choice = openAIRes.choices[0];
	const message = choice?.message;
	const output: ResponseItem[] = [];

	const reasoningContent = (message as Record<string, unknown> | undefined)
		?.reasoning_content;
	if (reasoningContent != null) {
		output.push({
			id: `rs_${ctx.responseId}`,
			type: "reasoning",
			summary: [{ type: "summary_text", text: String(reasoningContent) }],
		});
	}

	if (message?.tool_calls && message.tool_calls.length > 0) {
		const content = message.content
			? buildContentParts(message.content, message.annotations, message.refusal)
			: [];
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content,
		});
		for (const tc of message.tool_calls) {
			if (tc.type === "function") {
				output.push(mapOpenAIResponseToolCall(ctx, tc));
			}
		}
	} else if (message?.content !== null && message?.content !== undefined) {
		const content = buildContentParts(
			message.content,
			message.annotations,
			message.refusal,
		);
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content,
		});
	} else if (message?.refusal) {
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content: [{ type: "refusal", refusal: message.refusal }],
		});
	}

	return output;
}

function buildContentParts(
	content: string,
	annotations?: ChatCompletionAnnotation[],
	refusal?: string | null,
): ResponseOutputContent[] {
	const parts: ResponseOutputContent[] = [];

	const textPart: ResponseOutputContent = {
		type: "output_text",
		text: content,
	};
	if (annotations && annotations.length > 0) {
		textPart.annotations = annotations
			.map(mapAnnotation)
			.filter((a): a is URLCitation => a !== null);
	}
	parts.push(textPart);

	if (refusal) {
		parts.push({ type: "refusal", refusal });
	}

	return parts;
}

function mapAnnotation(
	annotation: ChatCompletionAnnotation,
): URLCitation | null {
	if (annotation.type === "url_citation") {
		const cit = annotation.url_citation;
		return {
			type: "url_citation",
			start_index: cit.start_index,
			end_index: cit.end_index,
			title: cit.title,
			url: cit.url,
		};
	}
	return null;
}
