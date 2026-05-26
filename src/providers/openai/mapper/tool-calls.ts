import type {
	ChatToolCallIdentity,
	ChatToolCallIdentityResolver,
	ChatToolCallMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	FunctionCall,
	ResponseItem,
} from "../../../protocol/openai/responses";
import { findFlattenedNamespaceTool } from "../../shared/tool-name-mapping";

export function mapOpenAIToolCall(
	ctx: ResponsesContext,
	toolCall: ToolCallSnapshot,
): FunctionCall {
	return functionCallFromName(
		ctx,
		toolCall.id,
		toolCall.name,
		toolCall.arguments,
	);
}

export function mapOpenAIResponseToolCall(
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
		_ctx: ResponsesContext,
		call: ToolCallSnapshot,
		identity: ChatToolCallIdentity,
	): ResponseItem {
		return {
			type: "function_call",
			call_id: call.id,
			...(identity.namespace ? { namespace: identity.namespace } : {}),
			name: identity.name,
			arguments: call.arguments,
		};
	}
}
