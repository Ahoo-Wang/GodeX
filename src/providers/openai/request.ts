import type { ResponsesContext } from "../../context/responses-context";
import type { ChatCompletionCreateRequest } from "../../protocol/openai/completions";
import type { ResponseToolChoice } from "../../protocol/openai/responses";
import { buildOpenAIMessages } from "./messages";
import { mapToolChoice, mapTools } from "./tools";

export function buildOpenAIRequest(ctx: ResponsesContext): ChatCompletionCreateRequest {
	const req = ctx.request;
	const messages = buildOpenAIMessages(req, ctx.session);
	const result: ChatCompletionCreateRequest = { model: ctx.resolved.model, messages };

	if (req.stream) result.stream = true;
	if (req.temperature !== undefined) result.temperature = req.temperature;
	if (req.top_p !== undefined) result.top_p = req.top_p;
	if (req.max_output_tokens !== undefined) result.max_completion_tokens = req.max_output_tokens;
	if (req.user) result.user = req.user;
	if (req.metadata) result.metadata = req.metadata;
	if (req.seed !== undefined) result.seed = req.seed;
	if (req.stop) result.stop = req.stop;
	if (req.store !== undefined) result.store = req.store;
	if (req.service_tier) result.service_tier = req.service_tier;

	if (req.reasoning?.effort && req.reasoning.effort !== "none") {
		result.reasoning_effort = req.reasoning.effort;
	}

	if (req.text?.format?.type === "json_schema" || req.text?.format?.type === "json_object") {
		result.response_format = req.text.format;
	}

	if (req.tools && req.tools.length > 0) {
		const mapped = mapTools(req.tools);
		if (mapped.tools.length > 0) result.tools = mapped.tools;
		if (mapped.webSearchOptions) result.web_search_options = mapped.webSearchOptions;
	}

	const toolChoice = mapToolChoice(req.tool_choice as ResponseToolChoice | undefined);
	if (toolChoice !== undefined) result.tool_choice = toolChoice;

	return result;
}
