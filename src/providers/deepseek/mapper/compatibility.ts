import {
	type CompatibilityPlan,
	supportedPlan,
} from "../../../adapter/mapper/chat/compatibility-plan";
import type { CompatibilityNegotiator } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import { warnIgnoredParameter } from "../../shared/compatibility-diagnostics";
import { DEEPSEEK_CAPABILITIES } from "./capabilities";

export class DeepSeekCompatibilityNegotiator
	implements CompatibilityNegotiator
{
	negotiate(ctx: ResponsesContext): CompatibilityPlan {
		const plan = supportedPlan(DEEPSEEK_CAPABILITIES);
		const warnIgnored = (path: string, value: unknown, message: string): void =>
			warnIgnoredParameter({
				ctx,
				plan,
				providerLabel: "DeepSeek",
				path,
				value,
				message,
			});

		warnIgnored(
			"background",
			ctx.request.background === true ? ctx.request.background : undefined,
			"Background responses are not supported by the DeepSeek Chat Completions adapter; forwarding synchronously.",
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
			"DeepSeek Chat Completions does not expose parallel tool-call control.",
		);
		warnIgnored(
			"metadata",
			ctx.request.metadata,
			"DeepSeek Chat Completions does not accept Responses metadata; metadata stays on the Response envelope.",
		);
		warnIgnored(
			"service_tier",
			ctx.request.service_tier,
			"DeepSeek Chat Completions does not expose OpenAI service tier selection.",
		);
		warnIgnored(
			"prompt_cache_key",
			ctx.request.prompt_cache_key,
			"DeepSeek Chat Completions does not expose Responses prompt cache key controls.",
		);
		warnIgnored(
			"prompt_cache_retention",
			ctx.request.prompt_cache_retention,
			"DeepSeek Chat Completions does not expose Responses prompt cache retention controls.",
		);
		warnIgnored(
			"stream_options.include_obfuscation",
			ctx.request.stream_options?.include_obfuscation,
			"Stream obfuscation is a Responses API option and is not forwarded to DeepSeek.",
		);
		warnIgnored(
			"text.verbosity",
			ctx.request.text?.verbosity,
			"DeepSeek Chat Completions does not support text verbosity controls.",
		);
		return plan;
	}
}
