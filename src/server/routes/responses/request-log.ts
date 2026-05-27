import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseCreateRequest } from "../../../protocol/openai";

export function responseRequestLogEntry(
	body: ResponseCreateRequest,
	ctx: ResponsesContext,
): Record<string, unknown> {
	return {
		model: body.model,
		resolved: ctx.resolved,
		stream: body.stream,
		previous_response_id: body.previous_response_id,
		store: body.store,
		input_count: responseInputCount(body),
		tools_count: body.tools?.length ?? 0,
		safety_identifier: body.safety_identifier,
		prompt_cache_key: body.prompt_cache_key,
		prompt_cache_retention: body.prompt_cache_retention,
		service_tier: body.service_tier,
		background: body.background,
		max_tool_calls: body.max_tool_calls,
		parallel_tool_calls: body.parallel_tool_calls,
		context_management: body.context_management,
	};
}

function responseInputCount(body: ResponseCreateRequest): number {
	if (Array.isArray(body.input)) return body.input.length;
	return body.input ? 1 : 0;
}
