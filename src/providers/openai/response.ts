import type { ResponsesContext } from "../../context/responses-context";
import type { ChatCompletion } from "../../protocol/openai/completions";
import type {
	ResponseItem,
	ResponseObject,
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
		for (const tc of message.tool_calls) {
			if (tc.type === "function") output.push(mapResponseToolCall(tc));
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
