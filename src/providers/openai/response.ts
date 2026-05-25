import type { ResponsesContext } from "../../context/responses-context";
import type {
	ChatCompletion,
	ChatCompletionAnnotation,
} from "../../protocol/openai/completions";
import type {
	ResponseItem,
	ResponseObject,
	ResponseOutputContent,
	URLCitation,
} from "../../protocol/openai/responses";
import {
	buildOpenAIResponseObject,
	mapUsage,
	openAIStatusFields,
} from "./response-common";
import { mapResponseToolCall } from "./tool-calls";

export function buildResponseObject(
	ctx: ResponsesContext,
	openAIRes: ChatCompletion,
): ResponseObject {
	if (!openAIRes.choices || openAIRes.choices.length === 0) {
		return buildOpenAIResponseObject(
			ctx,
			{
				status: "failed",
				error: { code: "server_error", message: "Empty choices from upstream" },
			},
			{
				output: [],
				outputText: "",
				usage: null,
				completedAt: Math.floor(Date.now() / 1000),
			},
		);
	}
	const choice = openAIRes.choices[0];
	const output = buildOutputItems(ctx, openAIRes);
	return buildOpenAIResponseObject(
		ctx,
		openAIStatusFields(choice?.finish_reason),
		{
			output,
			outputText: extractOutputText(output),
			usage: mapUsage(openAIRes.usage) ?? null,
			completedAt: Math.floor(Date.now() / 1000),
		},
	);
}

function buildOutputItems(
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
			if (tc.type === "function") output.push(mapResponseToolCall(tc));
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

function extractOutputText(output: ResponseItem[]): string {
	return output
		.filter(
			(
				item,
			): item is Extract<
				ResponseItem,
				{ type: "message"; content: unknown[] }
			> => item.type === "message" && "content" in item,
		)
		.flatMap((item) => item.content as unknown[])
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
