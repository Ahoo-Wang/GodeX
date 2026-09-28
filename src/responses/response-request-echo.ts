import type { ResponsesContext } from "../context/responses-context";
import type { ResponseObject } from "../protocol/openai/responses";

export function responseRequestEchoFields(
	ctx: ResponsesContext,
): Partial<ResponseObject> {
	const req = ctx.request;
	return {
		...(req.instructions !== undefined
			? { instructions: req.instructions }
			: {}),
		...(req.max_output_tokens !== undefined
			? { max_output_tokens: req.max_output_tokens }
			: {}),
		...(req.max_tool_calls !== undefined
			? { max_tool_calls: req.max_tool_calls }
			: {}),
		...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
		...(req.top_p !== undefined ? { top_p: req.top_p } : {}),
		...(req.tool_choice !== undefined ? { tool_choice: req.tool_choice } : {}),
		...(req.tools !== undefined ? { tools: req.tools } : {}),
		...(req.parallel_tool_calls !== undefined
			? { parallel_tool_calls: req.parallel_tool_calls }
			: {}),
		...(req.previous_response_id !== undefined
			? { previous_response_id: req.previous_response_id }
			: {}),
		...(req.store !== undefined ? { store: req.store } : {}),
		...(req.stream !== undefined ? { stream: req.stream } : {}),
		...(req.metadata !== undefined ? { metadata: req.metadata } : {}),
		...(req.prompt !== undefined ? { prompt: req.prompt } : {}),
		...(req.service_tier !== undefined
			? { service_tier: req.service_tier }
			: {}),
		...(req.context_management !== undefined
			? { context_management: req.context_management }
			: {}),
		...(req.conversation !== undefined
			? { conversation: normalizeConversation(req.conversation) }
			: {}),
		...(req.reasoning !== undefined ? { reasoning: req.reasoning } : {}),
		...(req.text !== undefined ? { text: req.text } : {}),
		...(req.truncation !== undefined ? { truncation: req.truncation } : {}),
		...(req.user !== undefined ? { user: req.user } : {}),
		...(req.prompt_cache_key !== undefined
			? { prompt_cache_key: req.prompt_cache_key }
			: {}),
		...(req.prompt_cache_retention !== undefined
			? { prompt_cache_retention: req.prompt_cache_retention }
			: {}),
		...(req.safety_identifier !== undefined
			? { safety_identifier: req.safety_identifier }
			: {}),
		...(req.include !== undefined ? { include: req.include } : {}),
		...(req.background !== undefined ? { background: req.background } : {}),
	};
}

function normalizeConversation(
	conversation: NonNullable<ResponsesContext["request"]["conversation"]>,
): { id: string } {
	return typeof conversation === "string" ? { id: conversation } : conversation;
}
