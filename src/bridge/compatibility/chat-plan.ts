import type { CompatibilityDiagnostic } from "../../adapter/compatibility";
import { isRecord } from "../../adapter/utils";
import type { ResponsesContext } from "../../context/responses-context";
import {
	type CompatibilityPlan,
	type ProviderCapabilities,
	supportedPlan,
} from "./compatibility-plan";
import {
	type PlanBridgeCompatibilityInput,
	planBridgeCompatibility as planBridgeCompatibilityFromInput,
} from "./planner";

export interface BridgeIgnoredParameterRule {
	readonly path: string;
	readonly value: (ctx: ResponsesContext) => unknown;
	readonly message: (providerLabel: string) => string;
}

export interface BridgeCompatibilityProfile {
	readonly providerLabel: string;
	readonly capabilities: ProviderCapabilities;
	readonly ignoredParameters?: readonly BridgeIgnoredParameterRule[];
}

export const CHAT_COMPLETIONS_COMMON_IGNORED_PARAMETERS = [
	ignoredParameter(
		"background",
		(ctx) =>
			ctx.request.background === true ? ctx.request.background : undefined,
		(providerLabel) =>
			`Background responses are not supported by the ${providerLabel} Chat Completions adapter; forwarding synchronously.`,
	),
	ignoredParameter(
		"conversation",
		(ctx) => ctx.request.conversation,
		() =>
			"Conversation lifecycle support is not implemented; use previous_response_id instead.",
	),
	ignoredParameter(
		"prompt",
		(ctx) => ctx.request.prompt,
		() =>
			"Prompt templates must be resolved before reaching the provider adapter.",
	),
	ignoredParameter(
		"truncation",
		(ctx) =>
			ctx.request.truncation === "auto" ? ctx.request.truncation : undefined,
		() =>
			"Automatic context truncation is not implemented; forwarding without truncation.",
	),
	ignoredParameter(
		"parallel_tool_calls",
		(ctx) => ctx.request.parallel_tool_calls,
		(providerLabel) =>
			`${providerLabel} Chat Completions does not expose parallel tool-call control.`,
	),
] as const satisfies readonly BridgeIgnoredParameterRule[];

export const RESPONSES_ENVELOPE_IGNORED_PARAMETERS = [
	ignoredParameter(
		"metadata",
		(ctx) => ctx.request.metadata,
		(providerLabel) =>
			`${providerLabel} Chat Completions does not accept Responses metadata; metadata stays on the Response envelope.`,
	),
	ignoredParameter(
		"service_tier",
		(ctx) => ctx.request.service_tier,
		(providerLabel) =>
			`${providerLabel} Chat Completions does not expose OpenAI service tier selection.`,
	),
	ignoredParameter(
		"prompt_cache_key",
		(ctx) => ctx.request.prompt_cache_key,
		(providerLabel) =>
			`${providerLabel} Chat Completions does not expose Responses prompt cache key controls.`,
	),
	ignoredParameter(
		"prompt_cache_retention",
		(ctx) => ctx.request.prompt_cache_retention,
		(providerLabel) =>
			`${providerLabel} Chat Completions does not expose Responses prompt cache retention controls.`,
	),
	ignoredParameter(
		"stream_options.include_obfuscation",
		(ctx) => ctx.request.stream_options?.include_obfuscation,
		() =>
			"Stream obfuscation is a Responses API option and is not forwarded to Chat Completions.",
	),
	ignoredParameter(
		"text.verbosity",
		(ctx) => ctx.request.text?.verbosity,
		(providerLabel) =>
			`${providerLabel} Chat Completions does not support text verbosity controls.`,
	),
] as const satisfies readonly BridgeIgnoredParameterRule[];

export function planBridgeCompatibility(
	input: PlanBridgeCompatibilityInput,
): CompatibilityPlan;
export function planBridgeCompatibility(
	ctx: ResponsesContext,
	profile: BridgeCompatibilityProfile,
): CompatibilityPlan;
export function planBridgeCompatibility(
	ctxOrInput: ResponsesContext | PlanBridgeCompatibilityInput,
	profile?: BridgeCompatibilityProfile,
): CompatibilityPlan {
	if (profile === undefined) {
		return planBridgeCompatibilityFromInput(
			ctxOrInput as PlanBridgeCompatibilityInput,
		);
	}
	const ctx = ctxOrInput as ResponsesContext;
	const plan = supportedPlan(profile.capabilities);
	for (const rule of profile.ignoredParameters ?? []) {
		warnIgnoredParameter({
			ctx,
			plan,
			providerLabel: profile.providerLabel,
			path: rule.path,
			value: rule.value(ctx),
			message: rule.message(profile.providerLabel),
		});
	}
	planResponseFormat(ctx, plan, profile.providerLabel);
	return plan;
}

export function ignoredParameter(
	path: string,
	value: BridgeIgnoredParameterRule["value"],
	message: BridgeIgnoredParameterRule["message"],
): BridgeIgnoredParameterRule {
	return { path, value, message };
}

function planResponseFormat(
	ctx: ResponsesContext,
	plan: CompatibilityPlan,
	providerLabel: string,
): void {
	const requestedType = ctx.request.text?.format?.type;
	if (!requestedType) return;
	if (plan.capabilities.responseFormats.supported.has(requestedType)) {
		plan.responseFormat = { action: "supported" };
		return;
	}
	const degraded =
		plan.capabilities.responseFormats.degraded?.get(requestedType);
	if (!degraded) {
		warnRejectedResponseFormat({ ctx, plan, requestedType });
		return;
	}
	warnDegradedResponseFormat({
		ctx,
		plan,
		providerLabel,
		from: requestedType,
		to: degraded,
	});
}

function warnIgnoredParameter(options: {
	ctx: ResponsesContext;
	plan: CompatibilityPlan;
	providerLabel: string;
	path: string;
	value: unknown;
	message: string;
}): void {
	if (options.value === undefined) return;

	const diagnostic: CompatibilityDiagnostic = {
		code: "adapter.param.unsupported",
		severity: "warn",
		path: options.path,
		action: "ignored",
		message: options.message,
		metadata: {
			provider: options.ctx.resolved.provider,
			model: options.ctx.resolved.model,
			parameter: options.path,
			value: summarizeCompatibilityValue(options.value),
		},
	};
	options.ctx.addDiagnostic(diagnostic);
	options.plan.diagnostics.push(diagnostic);
	options.plan.parameters[options.path] = {
		action: "ignored",
		reason: diagnostic.message,
	};
}

function warnRejectedResponseFormat({
	ctx,
	plan,
	requestedType,
}: {
	ctx: ResponsesContext;
	plan: CompatibilityPlan;
	requestedType: string;
}): void {
	const diagnostic: CompatibilityDiagnostic = {
		code: "adapter.param.unsupported",
		severity: "error",
		path: "text.format",
		action: "rejected",
		message: `text.format ${requestedType} is not supported by provider ${ctx.resolved.provider}.`,
		metadata: {
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			parameter: "text.format",
			value: requestedType,
		},
	};
	ctx.addDiagnostic(diagnostic);
	plan.diagnostics.push(diagnostic);
	plan.parameters["text.format"] = {
		action: "rejected",
		reason: diagnostic.message,
	};
	plan.responseFormat = {
		action: "rejected",
		reason: diagnostic.message,
	};
}

function warnDegradedResponseFormat({
	ctx,
	plan,
	providerLabel,
	from,
	to,
}: {
	ctx: ResponsesContext;
	plan: CompatibilityPlan;
	providerLabel: string;
	from: string;
	to: string;
}): void {
	const diagnostic: CompatibilityDiagnostic = {
		code: "adapter.param.unsupported",
		severity: "warn",
		path: "text.format",
		action: "degraded",
		message: `${providerLabel} Chat Completions supports ${to} but does not enforce Responses ${from}; using ${to} with a schema instruction.`,
		metadata: {
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			parameter: "text.format",
			value: summarizeCompatibilityValue(ctx.request.text?.format),
			effectiveValue: { type: to },
		},
	};
	ctx.addDiagnostic(diagnostic);
	plan.diagnostics.push(diagnostic);
	plan.parameters["text.format"] = {
		action: "degraded",
		reason: diagnostic.message,
		effectiveValue: { type: to },
	};
	plan.responseFormat = {
		action: "degraded",
		reason: diagnostic.message,
		effectiveValue: { type: to },
	};
}

export function summarizeCompatibilityValue(value: unknown): unknown {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (Array.isArray(value)) {
		return { type: "array", length: value.length };
	}

	if (isRecord(value)) {
		const summary: Record<string, unknown> = {
			type: "object",
			keys: Object.keys(value).sort(),
		};
		if (typeof value.id === "string") {
			summary.id = value.id;
		}
		return summary;
	}

	return typeof value;
}
