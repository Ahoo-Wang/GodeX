import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatRequestFactory,
	ChatRequestOptionsMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ProviderToolIndex } from "../../../adapter/mapper/chat/tool-index";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ChatCompletionRequest,
	DeepSeekTool,
} from "../protocol/completions";

export class DeepSeekRequestFactory
	implements ChatRequestFactory<ChatCompletionRequest>
{
	create(
		ctx: ResponsesContext,
		_plan: CompatibilityPlan,
	): ChatCompletionRequest {
		return { model: ctx.resolved.model, messages: [] };
	}
}

export class DeepSeekRequestOptionsMapper
	implements ChatRequestOptionsMapper<ChatCompletionRequest, DeepSeekTool[]>
{
	apply(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		request: ChatCompletionRequest,
		_toolIndex: ProviderToolIndex<DeepSeekTool[]>,
	): void {
		const req = ctx.request;
		const thinkingEnabled =
			req.reasoning?.effort !== undefined && req.reasoning.effort !== "none";
		if (thinkingEnabled) {
			request.thinking = { type: "enabled" };
			request.reasoning_effort =
				req.reasoning?.effort === "xhigh" ? "max" : "high";
			diagnoseIgnoredSampling(ctx, "temperature", req.temperature);
			diagnoseIgnoredSampling(ctx, "top_p", req.top_p);
		} else {
			request.thinking = { type: "disabled" };
			if (req.temperature !== undefined) request.temperature = req.temperature;
			if (req.top_p !== undefined) request.top_p = req.top_p;
		}
		if (req.stream) {
			request.stream = true;
			request.stream_options = { include_usage: true };
		}
		if (req.max_output_tokens !== undefined) {
			request.max_tokens = req.max_output_tokens;
		}
		const userId = req.safety_identifier ?? req.user;
		if (userId) request.user_id = userId;
		if (
			req.text?.format?.type === "json_object" ||
			req.text?.format?.type === "json_schema"
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

function diagnoseIgnoredSampling(
	ctx: ResponsesContext,
	path: "temperature" | "top_p",
	value: unknown,
): void {
	if (value === undefined) return;
	ctx.addDiagnostic({
		code: "adapter.param.unsupported",
		severity: "warn",
		path,
		action: "ignored",
		message: `DeepSeek thinking mode ignores ${path}; omitted from upstream request.`,
		metadata: { parameter: path, value },
	});
}
