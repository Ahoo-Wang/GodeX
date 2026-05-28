import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatRequestFactory,
	ChatRequestOptionsMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ChatCompletionCreateRequest } from "../../../protocol/openai/completions";
import { getOpenAIMappedTools } from "./tools";

export class OpenAIRequestFactory
	implements ChatRequestFactory<ChatCompletionCreateRequest>
{
	create(
		ctx: ResponsesContext,
		_plan: CompatibilityPlan,
	): ChatCompletionCreateRequest {
		return {
			model: ctx.resolved.model,
			messages: [],
		};
	}
}

export class OpenAIRequestOptionsMapper
	implements ChatRequestOptionsMapper<ChatCompletionCreateRequest>
{
	apply(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		request: ChatCompletionCreateRequest,
	): void {
		const req = ctx.request;
		if (req.stream) {
			request.stream = true;
			request.stream_options = { include_usage: true };
		}
		if (req.temperature !== undefined) request.temperature = req.temperature;
		if (req.top_p !== undefined) request.top_p = req.top_p;
		if (req.max_output_tokens !== undefined) {
			request.max_completion_tokens = req.max_output_tokens;
		}
		if (req.user) request.user = req.user;
		if (req.metadata) request.metadata = req.metadata;
		if (req.store !== undefined) request.store = req.store;
		if (req.service_tier) request.service_tier = req.service_tier;
		if (req.prompt_cache_key !== undefined)
			request.prompt_cache_key = req.prompt_cache_key;
		if (req.prompt_cache_retention !== undefined)
			request.prompt_cache_retention = req.prompt_cache_retention;
		if (req.safety_identifier !== undefined)
			request.safety_identifier = req.safety_identifier;
		if (req.parallel_tool_calls !== undefined)
			request.parallel_tool_calls = req.parallel_tool_calls;

		if (req.reasoning?.effort && req.reasoning.effort !== "none") {
			request.reasoning_effort = req.reasoning.effort;
		}

		if (req.text?.format?.type === "json_object") {
			request.response_format = req.text.format;
		} else if (req.text?.format?.type === "json_schema") {
			const fmt = req.text.format;
			request.response_format = {
				type: "json_schema",
				json_schema: {
					name: fmt.name,
					schema: fmt.schema,
					...(fmt.description ? { description: fmt.description } : {}),
					...(fmt.strict !== undefined ? { strict: fmt.strict } : {}),
				},
			};
		}
		if (req.text?.verbosity !== undefined)
			request.verbosity = req.text.verbosity;

		if (req.tools && req.tools.length > 0) {
			const mapped = getOpenAIMappedTools(ctx, plan);
			if (mapped.webSearchOptions)
				request.web_search_options = mapped.webSearchOptions;
		}
	}
}
