import type { ResponsesContext } from "../../context/responses-context";
import type { ChatCompletionCreateRequest } from "../../protocol/openai/completions";
import type { ResponseToolChoice } from "../../protocol/openai/responses";
import { buildOpenAIMessages } from "./messages";
import { mapToolChoice, mapTools } from "./tools";

export function buildOpenAIRequest(
	ctx: ResponsesContext,
): ChatCompletionCreateRequest {
	const req = ctx.request;
	const messages = buildOpenAIMessages(req, ctx.session);
	const result: ChatCompletionCreateRequest = {
		model: ctx.resolved.model,
		messages,
	};

	if (req.stream) {
		result.stream = true;
		result.stream_options = { include_usage: true };
	}
	if (req.temperature !== undefined) result.temperature = req.temperature;
	if (req.top_p !== undefined) result.top_p = req.top_p;
	if (req.max_output_tokens !== undefined)
		result.max_completion_tokens = req.max_output_tokens;
	if (req.user) result.user = req.user;
	if (req.metadata) result.metadata = req.metadata;
	if (req.store !== undefined) result.store = req.store;
	if (req.service_tier) result.service_tier = req.service_tier;
	if (req.prompt_cache_key !== undefined)
		result.prompt_cache_key = req.prompt_cache_key;
	if (req.prompt_cache_retention !== undefined)
		result.prompt_cache_retention = req.prompt_cache_retention;
	if (req.safety_identifier !== undefined)
		result.safety_identifier = req.safety_identifier;
	if (req.parallel_tool_calls !== undefined)
		result.parallel_tool_calls = req.parallel_tool_calls;

	if (req.reasoning?.effort && req.reasoning.effort !== "none") {
		result.reasoning_effort = req.reasoning.effort;
	}

	if (req.text?.format?.type === "json_object") {
		result.response_format = req.text.format;
	} else if (req.text?.format?.type === "json_schema") {
		const fmt = req.text.format;
		result.response_format = {
			type: "json_schema",
			json_schema: {
				name: fmt.name,
				schema: fmt.schema,
				...(fmt.description ? { description: fmt.description } : {}),
				...(fmt.strict !== undefined ? { strict: fmt.strict } : {}),
			},
		};
	}
	if (req.text?.verbosity !== undefined) result.verbosity = req.text.verbosity;

	if (req.tools && req.tools.length > 0) {
		const mapped = mapTools(req.tools);
		if (mapped.tools.length > 0) result.tools = mapped.tools;
		if (mapped.webSearchOptions)
			result.web_search_options = mapped.webSearchOptions;
	}

	const toolChoice = mapToolChoice(
		req.tool_choice as ResponseToolChoice | undefined,
	);
	if (toolChoice !== undefined) result.tool_choice = toolChoice;

	return result;
}
