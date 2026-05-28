import type { ChatToolCallRestorer } from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import { createFunctionCall } from "../../../adapter/mapper/chat/tool-index";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseItem } from "../../../protocol/openai/responses";

export class ZhipuToolCallRestorer implements ChatToolCallRestorer {
	restore(ctx: ResponsesContext, call: ToolCallSnapshot): ResponseItem {
		return mapZhipuToolCall(ctx, call);
	}
}

export function mapZhipuToolCall(
	ctx: ResponsesContext,
	toolCall: ToolCallSnapshot,
): ResponseItem {
	const name = toolCall.name ?? "";
	const callId = toolCall.id ?? `fc_${name || "tool"}`;
	const args = toolCall.arguments ?? "{}";

	return (
		ctx.toolIndex?.current()?.restoreProviderFunctionCall({
			providerName: name,
			callId,
			args,
		}) ?? createFunctionCall(callId, name, args)
	);
}
