import type { ToolCallAccumulator } from "../../adapter/mapper/stream-state";
import type { ResponsesContext } from "../../context/responses-context";
import type { FunctionCall } from "../../protocol/openai/responses";
import { findFlattenedNamespaceTool } from "../shared/tool-name-mapping";

export function mapToolCall(
	ctx: ResponsesContext,
	toolCall: ToolCallAccumulator,
): FunctionCall {
	return functionCallFromName(
		ctx,
		toolCall.id,
		toolCall.name,
		toolCall.arguments,
	);
}

export function mapResponseToolCall(
	ctx: ResponsesContext,
	toolCall: {
		id: string;
		function?: { name: string; arguments: string };
	},
): FunctionCall {
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
): FunctionCall {
	const namespaceMatch = findFlattenedNamespaceTool(
		ctx.request.tools,
		providerName,
	);
	return {
		type: "function_call",
		call_id: callId,
		...(namespaceMatch ? { namespace: namespaceMatch.namespace } : {}),
		name: namespaceMatch?.name ?? providerName,
		arguments: args,
	};
}
