import {
	type CompatibilityPlan,
	supportedPlan,
} from "../../../adapter/mapper/chat/compatibility-plan";
import type { CompatibilityNegotiator } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import { ZHIPU_CAPABILITIES } from "./capabilities";

export class ZhipuCompatibilityNegotiator implements CompatibilityNegotiator {
	negotiate(ctx: ResponsesContext): CompatibilityPlan {
		const plan = supportedPlan(ZHIPU_CAPABILITIES);
		warnIgnored(ctx, plan, "background", ctx.request.background === true);
		warnIgnored(
			ctx,
			plan,
			"conversation",
			ctx.request.conversation !== undefined,
		);
		warnIgnored(ctx, plan, "prompt", ctx.request.prompt !== undefined);
		if (ctx.request.truncation === "auto") {
			warnIgnored(ctx, plan, "truncation", true);
		}
		if (ctx.request.parallel_tool_calls !== undefined) {
			warnIgnored(ctx, plan, "parallel_tool_calls", true);
		}
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
		message: `Zhipu Chat Completions does not support Responses parameter '${path}'; ignored.`,
		metadata: { parameter: path },
	};
	ctx.addDiagnostic(diagnostic);
	plan.diagnostics.push(diagnostic);
	plan.parameters[path] = { action: "ignored", reason: diagnostic.message };
}
