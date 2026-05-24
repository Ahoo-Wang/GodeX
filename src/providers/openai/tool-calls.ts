import type { ToolCallAccumulator } from "../../adapter/mapper/stream-state";
import type { ResponsesContext } from "../../context/responses-context";
import type { FunctionCall } from "../../protocol/openai/responses";

export function mapToolCall(
	_ctx: ResponsesContext,
	toolCall: ToolCallAccumulator,
): FunctionCall {
	return {
		type: "function_call",
		call_id: toolCall.id,
		name: toolCall.name,
		arguments: toolCall.arguments,
	};
}

export function mapResponseToolCall(toolCall: {
	id: string;
	function?: { name: string; arguments: string };
}): FunctionCall {
	return {
		type: "function_call",
		call_id: toolCall.id,
		name: toolCall.function?.name ?? "",
		arguments: toolCall.function?.arguments ?? "{}",
	};
}
