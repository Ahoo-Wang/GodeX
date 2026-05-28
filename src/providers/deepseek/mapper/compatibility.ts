import {
	type CompatibilityPlan,
	supportedPlan,
} from "../../../adapter/mapper/chat/compatibility-plan";
import type { CompatibilityNegotiator } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import { DEEPSEEK_CAPABILITIES } from "./capabilities";

export class DeepSeekCompatibilityNegotiator
	implements CompatibilityNegotiator
{
	negotiate(ctx: ResponsesContext): CompatibilityPlan {
		const plan = supportedPlan(DEEPSEEK_CAPABILITIES);
		warnIgnored(ctx, plan, "background", ctx.request.background === true);
		warnIgnored(
			ctx,
			plan,
			"conversation",
			ctx.request.conversation !== undefined,
		);
		warnIgnored(ctx, plan, "prompt", ctx.request.prompt !== undefined);
		warnIgnored(ctx, plan, "truncation", ctx.request.truncation === "auto");
		warnIgnored(
			ctx,
			plan,
			"parallel_tool_calls",
			ctx.request.parallel_tool_calls !== undefined,
		);
		warnIgnored(ctx, plan, "metadata", ctx.request.metadata !== undefined);
		warnIgnored(
			ctx,
			plan,
			"service_tier",
			ctx.request.service_tier !== undefined,
		);
		warnIgnored(
			ctx,
			plan,
			"prompt_cache_key",
			ctx.request.prompt_cache_key !== undefined,
		);
		warnIgnored(
			ctx,
			plan,
			"prompt_cache_retention",
			ctx.request.prompt_cache_retention !== undefined,
		);
		warnIgnored(
			ctx,
			plan,
			"stream_options.include_obfuscation",
			ctx.request.stream_options?.include_obfuscation !== undefined,
		);
		warnIgnored(
			ctx,
			plan,
			"text.verbosity",
			ctx.request.text?.verbosity !== undefined,
		);
		return plan;
	}
}

function warnIgnored(
	ctx: ResponsesContext,
	plan: CompatibilityPlan,
	path: string,
	condition: boolean,
): void {
	if (!condition) return;
	const diagnostic = {
		code: "adapter.param.unsupported",
		severity: "warn" as const,
		path,
		action: "ignored" as const,
		message: `DeepSeek Chat Completions does not support Responses parameter '${path}'; ignored.`,
		metadata: { parameter: path },
	};
	ctx.addDiagnostic(diagnostic);
	plan.diagnostics.push(diagnostic);
	plan.parameters[path] = { action: "ignored", reason: diagnostic.message };
}
