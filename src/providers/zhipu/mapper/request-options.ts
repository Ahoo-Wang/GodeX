import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatRequestFactory,
	ChatRequestOptionsMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ProviderToolIndex } from "../../../adapter/mapper/chat/tool-index";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ChatCompletionTextRequest,
	ChatTool,
} from "../protocol/completions";
import type { TextModel } from "../protocol/models";

export class ZhipuRequestFactory
	implements ChatRequestFactory<ChatCompletionTextRequest>
{
	create(
		ctx: ResponsesContext,
		_plan: CompatibilityPlan,
	): ChatCompletionTextRequest {
		return { model: ctx.resolved.model as TextModel, messages: [] };
	}
}

export class ZhipuRequestOptionsMapper
	implements ChatRequestOptionsMapper<ChatCompletionTextRequest, ChatTool[]>
{
	apply(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		request: ChatCompletionTextRequest,
		_toolIndex: ProviderToolIndex<ChatTool[]>,
	): void {
		const req = ctx.request;
		if (req.stream) {
			request.stream = true;
			request.stream_options = { include_usage: true };
		}
		if (req.temperature !== undefined)
			request.temperature = Math.min(Math.max(req.temperature, 0), 1.0);
		if (req.top_p !== undefined) request.top_p = req.top_p;
		if (req.max_output_tokens !== undefined)
			request.max_tokens = req.max_output_tokens;
		const userId = req.safety_identifier ?? req.user;
		if (userId) request.user_id = userId;
		if (req.reasoning?.effort && req.reasoning.effort !== "none") {
			request.thinking = { type: "enabled" };
		}
		if (
			req.text?.format?.type === "json_schema" ||
			req.text?.format?.type === "json_object"
		) {
			request.response_format = { type: "json_object" };
			if (
				req.text.format.type === "json_schema" &&
				plan.responseFormat?.action === "degraded"
			) {
				const syntheticInstruction = ctx.outputFormatContract
					.current()
					.syntheticInstruction();
				if (syntheticInstruction) {
					request.messages.push({
						role: "user",
						content: syntheticInstruction,
					});
				}
			}
		}
	}
}
