import type {
	ChatToolCallIdentity,
	ChatToolCallIdentityResolver,
	ChatToolCallMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseItem } from "../../../protocol/openai/responses";
import {
	createFunctionCall,
	restoreToolCallFromFunctionName,
} from "../../shared/tool-call-restoration";
import { findFlattenedNamespaceTool } from "../../shared/tool-identity";
import { toDeepSeekFunctionName } from "../function-names";

export class DeepSeekToolCallIdentityResolver
	implements ChatToolCallIdentityResolver
{
	resolve(ctx: ResponsesContext, upstreamName: string): ChatToolCallIdentity {
		const match = findFlattenedNamespaceTool(
			ctx.request.tools,
			upstreamName,
			toDeepSeekFunctionName,
		);
		if (match) {
			return { upstreamName, name: match.name, namespace: match.namespace };
		}
		return { upstreamName, name: upstreamName };
	}
}

export class DeepSeekToolCallMapper implements ChatToolCallMapper {
	map(
		ctx: ResponsesContext,
		call: ToolCallSnapshot,
		identity: ChatToolCallIdentity,
	): ResponseItem {
		const name = identity.name;
		const callId = call.id ?? `fc_${name || "tool"}`;
		const args = call.arguments ?? "{}";

		return (
			restoreToolCallFromFunctionName({
				tools: ctx.request.tools,
				providerName: identity.upstreamName,
				callId,
				args,
				encodeName: toDeepSeekFunctionName,
			}) ?? createFunctionCall(callId, name, args, identity.namespace)
		);
	}
}

export function mapDeepSeekToolCall(
	ctx: ResponsesContext,
	toolCall: ToolCallSnapshot,
): ResponseItem {
	const name = toolCall.name ?? "";
	const callId = toolCall.id ?? `fc_${name || "tool"}`;
	const args = toolCall.arguments ?? "{}";

	return (
		restoreToolCallFromFunctionName({
			tools: ctx.request.tools,
			providerName: name,
			callId,
			args,
			encodeName: toDeepSeekFunctionName,
		}) ?? createFunctionCall(callId, name, args)
	);
}
