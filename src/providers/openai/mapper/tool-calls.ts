import type { ChatToolCallRestorer } from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import { createFunctionCall } from "../../../adapter/mapper/chat/tool-index";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ChatCompletionMessageToolCall } from "../../../protocol/openai/completions";
import type {
	CustomToolCall,
	ResponseItem,
} from "../../../protocol/openai/responses";

export function mapOpenAIResponseToolCall(
	ctx: ResponsesContext,
	toolCall: ChatCompletionMessageToolCall,
): ResponseItem {
	if (toolCall.type === "custom") {
		return customToolCall(
			toolCall.id,
			toolCall.custom.name,
			toolCall.custom.input,
		);
	}
	return functionCallFromName(
		ctx,
		toolCall.id,
		toolCall.function?.name ?? "",
		toolCall.function?.arguments ?? "{}",
	);
}

function functionCallFromName(
	ctx: ResponsesContext,
	callId: string,
	providerName: string,
	args: string,
): ResponseItem {
	return (
		ctx.toolIndex?.current()?.restoreProviderFunctionCall({
			providerName,
			callId,
			args,
		}) ?? createFunctionCall(callId, providerName, args)
	);
}

function customToolCall(
	callId: string,
	name: string,
	input: string,
): CustomToolCall {
	return {
		type: "custom_tool_call",
		call_id: callId,
		name,
		input,
	};
}

export class OpenAIToolCallRestorer implements ChatToolCallRestorer {
	restore(ctx: ResponsesContext, call: ToolCallSnapshot): ResponseItem {
		if (call.type === "custom") {
			const restored = ctx.toolIndex?.current()?.restoreProviderFunctionCall({
				providerName: call.name,
				callId: call.id,
				args: call.arguments,
			});
			if (restored?.type === "custom_tool_call") return restored;
			return customToolCall(call.id, call.name, call.arguments);
		}
		return (
			ctx.toolIndex?.current()?.restoreProviderFunctionCall({
				providerName: call.name,
				callId: call.id,
				args: call.arguments,
			}) ?? createFunctionCall(call.id, call.name, call.arguments)
		);
	}
}
