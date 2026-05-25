import type {
	StreamState,
	ToolCallAccumulator,
} from "../../adapter/mapper/stream-state";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseItem,
	ResponseObject,
	ResponseOutputContent,
} from "../../protocol/openai/responses";
import {
	ChatCompletionStreamMapper,
	type ChatStreamChoice,
	type ChatStreamToolCallDelta,
} from "../shared/chat-stream-mapper";
import { findFlattenedNamespaceTool } from "../shared/tool-name-mapping";
import { toZhipuFunctionName } from "./function-names";
import type {
	ChatCompletionChunk,
	ChatCompletionStreamDelta,
	FinishReason,
} from "./protocol/completions";
import { buildZhipuResponseObject, zhipuStatusFields } from "./response-common";
import { mapZhipuToolCall } from "./tool-calls";

export class ZhipuStreamMapper extends ChatCompletionStreamMapper<
	ChatCompletionChunk,
	ChatCompletionStreamDelta,
	FinishReason
> {
	protected extractChoice(
		chunk: ChatCompletionChunk,
	): ChatStreamChoice<ChatCompletionStreamDelta, FinishReason> | null {
		const choice = chunk.choices?.[0];
		if (!choice) return null;
		return {
			delta: choice.delta ?? {},
			finishReason: choice.finish_reason as FinishReason | null,
		};
	}

	protected extractText(delta: ChatCompletionStreamDelta): string {
		return delta.content != null ? extractStreamDeltaText(delta.content) : "";
	}

	protected override extractReasoningText(
		delta: ChatCompletionStreamDelta,
	): string {
		return delta.reasoning_content != null
			? String(delta.reasoning_content)
			: "";
	}

	protected override extractToolCalls(
		delta: ChatCompletionStreamDelta,
	): ChatStreamToolCallDelta[] {
		return delta.tool_calls ?? [];
	}

	protected mapFinishReason(finishReason: FinishReason) {
		return zhipuStatusFields(finishReason);
	}

	protected mapToolCall(
		ctx: ResponsesContext,
		toolCall: ToolCallAccumulator,
	): ResponseItem {
		return mapZhipuToolCall(ctx, toolCall);
	}

	protected override resolveToolCallIdentity(
		ctx: ResponsesContext,
		upstreamName: string,
	): { name: string; namespace?: string } {
		const match = findFlattenedNamespaceTool(
			ctx.request.tools,
			upstreamName,
			toZhipuFunctionName,
		);
		return match ?? { name: upstreamName };
	}

	protected override doneMessageContent(
		state: StreamState,
	): ResponseOutputContent[] {
		return [{ type: "output_text", text: state.outputText }];
	}

	buildResponseObject(
		ctx: ResponsesContext,
		state: StreamState,
	): ResponseObject {
		return buildZhipuResponseObject(ctx, state.finalStatus, {
			completedAt: state.completedAt ?? Math.floor(Date.now() / 1000),
			outputText: state.outputText,
			output: this.buildOutputItems(ctx, state),
		});
	}
}

function extractStreamDeltaText(
	content: NonNullable<ChatCompletionStreamDelta["content"]>,
): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((p) => p.type === "text")
			.map((p) => p.text)
			.join("");
	}
	return "";
}
