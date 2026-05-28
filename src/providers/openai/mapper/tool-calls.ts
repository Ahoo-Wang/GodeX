import type {
	ChatToolCallIdentity,
	ChatToolCallIdentityResolver,
	ChatToolCallMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ChatCompletionMessageToolCall } from "../../../protocol/openai/completions";
import type {
	CustomToolCall,
	ResponseItem,
} from "../../../protocol/openai/responses";
import {
	createFunctionCall,
	restoreToolCallFromFunctionName,
} from "../../shared/tool-call-restoration";
import { findFlattenedNamespaceTool } from "../../shared/tool-identity";

export function mapOpenAIToolCall(
	ctx: ResponsesContext,
	toolCall: ToolCallSnapshot,
): ResponseItem {
	if (toolCall.type === "custom") {
		return customToolCall(toolCall.id, toolCall.name, toolCall.arguments);
	}
	return functionCallFromName(
		ctx,
		toolCall.id,
		toolCall.name,
		toolCall.arguments,
	);
}

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
		restoreToolCallFromFunctionName({
			tools: ctx.request.tools,
			providerName,
			callId,
			args,
			encodeName: (name) => name,
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

export class OpenAIToolCallIdentityResolver
	implements ChatToolCallIdentityResolver
{
	resolve(ctx: ResponsesContext, upstreamName: string): ChatToolCallIdentity {
		const match = findFlattenedNamespaceTool(ctx.request.tools, upstreamName);
		if (match) {
			return {
				upstreamName,
				name: match.name,
				namespace: match.namespace,
			};
		}
		return { upstreamName, name: upstreamName };
	}
}

export class OpenAIToolCallMapper implements ChatToolCallMapper {
	map(
		ctx: ResponsesContext,
		call: ToolCallSnapshot,
		identity: ChatToolCallIdentity,
	): ResponseItem {
		if (call.type === "custom") {
			return customToolCall(call.id, identity.name, call.arguments);
		}
		return (
			restoreToolCallFromFunctionName({
				tools: ctx.request.tools,
				providerName: identity.upstreamName,
				callId: call.id,
				args: call.arguments,
				encodeName: (name) => name,
			}) ??
			createFunctionCall(
				call.id,
				identity.name,
				call.arguments,
				identity.namespace,
			)
		);
	}
}
