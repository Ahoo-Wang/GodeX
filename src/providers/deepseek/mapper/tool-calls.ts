import type {
	ChatToolCallIdentity,
	ChatToolCallIdentityResolver,
	ChatToolCallMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseItem } from "../../../protocol/openai/responses";

export class DeepSeekToolCallIdentityResolver
	implements ChatToolCallIdentityResolver
{
	resolve(_ctx: ResponsesContext, upstreamName: string): ChatToolCallIdentity {
		return { upstreamName, name: upstreamName };
	}
}

export class DeepSeekToolCallMapper implements ChatToolCallMapper {
	map(
		_ctx: ResponsesContext,
		call: ToolCallSnapshot,
		identity: ChatToolCallIdentity,
	): ResponseItem {
		return {
			type: "function_call",
			call_id: call.id,
			name: identity.name,
			arguments: call.arguments,
		};
	}
}
