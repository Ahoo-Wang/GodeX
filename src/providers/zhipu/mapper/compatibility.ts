import {
	type CompatibilityPlan,
	supportedPlan,
} from "../../../adapter/mapper/chat/compatibility-plan";
import type { CompatibilityNegotiator } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import {
	warnDegradedResponseFormat,
	warnIgnoredParameter,
} from "../../shared/compatibility-diagnostics";
import { ZHIPU_CAPABILITIES } from "./capabilities";

export class ZhipuCompatibilityNegotiator implements CompatibilityNegotiator {
	negotiate(ctx: ResponsesContext): CompatibilityPlan {
		const plan = supportedPlan(ZHIPU_CAPABILITIES);
		const warnIgnored = (path: string, value: unknown, message: string): void =>
			warnIgnoredParameter({
				ctx,
				plan,
				providerLabel: "Zhipu",
				path,
				value,
				message,
			});

		warnIgnored(
			"background",
			ctx.request.background === true ? ctx.request.background : undefined,
			"Background responses are not supported by the Zhipu Chat Completions adapter; forwarding synchronously.",
		);
		warnIgnored(
			"conversation",
			ctx.request.conversation,
			"Conversation lifecycle support is not implemented; use previous_response_id instead.",
		);
		warnIgnored(
			"prompt",
			ctx.request.prompt,
			"Prompt templates must be resolved before reaching the provider adapter.",
		);
		warnIgnored(
			"truncation",
			ctx.request.truncation === "auto" ? ctx.request.truncation : undefined,
			"Automatic context truncation is not implemented; forwarding without truncation.",
		);
		warnIgnored(
			"parallel_tool_calls",
			ctx.request.parallel_tool_calls,
			"Zhipu Chat Completions does not expose parallel tool-call control.",
		);
		if (ctx.request.text?.format?.type === "json_schema") {
			warnDegradedResponseFormat({
				ctx,
				plan,
				providerLabel: "Zhipu",
				from: "json_schema",
				to: "json_object",
			});
		}
		return plan;
	}
}
