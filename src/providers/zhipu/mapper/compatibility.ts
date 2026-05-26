import {
	type CompatibilityPlan,
	supportedPlan,
} from "../../../adapter/mapper/chat/compatibility-plan";
import type { CompatibilityNegotiator } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import {
	ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
	AdapterError,
} from "../../../error";
import { ZHIPU_CAPABILITIES } from "./capabilities";

export class ZhipuCompatibilityNegotiator implements CompatibilityNegotiator {
	negotiate(ctx: ResponsesContext): CompatibilityPlan {
		rejectWhen(
			ctx.request.background === true,
			"background",
			"background responses are not supported by the Zhipu Chat Completions adapter.",
			ctx,
		);
		rejectWhen(
			ctx.request.conversation !== undefined,
			"conversation",
			"conversation lifecycle support is not implemented; use previous_response_id instead.",
			ctx,
		);
		rejectWhen(
			ctx.request.prompt !== undefined,
			"prompt",
			"prompt templates must be resolved before reaching the provider adapter.",
			ctx,
		);

		const plan = supportedPlan(ZHIPU_CAPABILITIES);
		if (ctx.request.truncation === "auto") {
			const diagnostic = {
				code: "adapter.param.unsupported",
				severity: "warn" as const,
				path: "truncation",
				action: "ignored" as const,
				message:
					"Automatic context truncation is not implemented; forwarding without truncation.",
				metadata: { parameter: "truncation", value: ctx.request.truncation },
			};
			ctx.addDiagnostic(diagnostic);
			plan.diagnostics.push(diagnostic);
			plan.parameters.truncation = {
				action: "ignored",
				reason: diagnostic.message,
			};
		}
		if (ctx.request.parallel_tool_calls !== undefined) {
			const diagnostic = {
				code: "adapter.param.unsupported",
				severity: "warn" as const,
				path: "parallel_tool_calls",
				action: "ignored" as const,
				message:
					"Zhipu Chat Completions does not expose parallel tool-call control.",
				metadata: {
					parameter: "parallel_tool_calls",
					value: ctx.request.parallel_tool_calls,
				},
			};
			ctx.addDiagnostic(diagnostic);
			plan.diagnostics.push(diagnostic);
			plan.parameters.parallel_tool_calls = {
				action: "ignored",
				reason: diagnostic.message,
			};
		}
		return plan;
	}
}

function rejectWhen(
	condition: boolean,
	field: string,
	message: string,
	ctx: ResponsesContext,
): void {
	if (!condition) return;
	throw new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
		`Unsupported Responses parameter for Zhipu: ${field}. ${message}`,
		{
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			parameter: field,
		},
	);
}
