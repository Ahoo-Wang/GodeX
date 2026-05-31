import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { CompatibilityDiagnostic } from "../bridge/compatibility";
import {
	type BuildChatCompletionRequestResult,
	buildChatCompletionRequest,
} from "../bridge/request";
import {
	createToolPlanningProfile,
	type PlannedToolDecision,
} from "../bridge/tools";
import type { ResponsesContext } from "../context/responses-context";
import { recordTraceEvent, recordTraceRequest } from "../trace";

export interface ProviderRequestExchangeResult<ProviderResponse = unknown> {
	providerResponse: ProviderResponse;
	built: BuildChatCompletionRequestResult;
}

export interface ProviderStreamExchangeResult {
	providerStream: ReadableStream<JsonServerSentEvent<unknown>>;
	upstreamLatencyMillis: number;
	built: BuildChatCompletionRequestResult;
}

export class ProviderExchange {
	async request(ctx: ResponsesContext): Promise<ProviderRequestExchangeResult> {
		const built = buildProviderRequest(ctx, false);
		const providerRequest = built.request;
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: false,
		}));

		const upstreamStart = Date.now();
		const providerResponse = await ctx.provider.request(providerRequest, {
			onPatchedRequest: (patchedRequest) => {
				recordTraceRequest(ctx, false, patchedRequest);
			},
			onRequestPrepared: () => {
				recordTraceEvent(ctx, "provider.request.prepared", undefined);
			},
		});
		recordTraceEvent(ctx, "provider.response.body", providerResponse);
		ctx.logger.debug("provider.response.received", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			upstreamDurationMillis: Date.now() - upstreamStart,
		}));

		return { providerResponse, built };
	}

	async stream(ctx: ResponsesContext): Promise<ProviderStreamExchangeResult> {
		const built = buildProviderRequest(ctx, true);
		const providerRequest = built.request;
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: true,
		}));

		const upstreamStart = Date.now();
		const providerStream = await ctx.provider.stream(providerRequest, {
			onPatchedRequest: (patchedRequest) => {
				recordTraceRequest(ctx, true, patchedRequest);
			},
			onRequestPrepared: () => {
				recordTraceEvent(ctx, "provider.request.prepared", undefined);
			},
		});
		const upstreamLatencyMillis = Date.now() - upstreamStart;
		ctx.logger.debug("provider.stream.connected", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			upstreamLatencyMillis,
		}));

		return { providerStream, upstreamLatencyMillis, built };
	}
}

function buildProviderRequest(
	ctx: ResponsesContext,
	stream: boolean,
): BuildChatCompletionRequestResult {
	const built = buildChatCompletionRequest({
		request: stream ? { ...ctx.request, stream: true } : ctx.request,
		provider: ctx.provider.name,
		model: ctx.resolved.model,
		capabilities: ctx.provider.spec.capabilities,
		profile: createToolPlanningProfile({
			provider: ctx.provider.name,
			capabilities: ctx.provider.spec.capabilities,
			toProviderName: ctx.provider.spec.toolName.toProviderName,
		}),
		session: ctx.session,
	});
	for (const diagnostic of built.compatibility.diagnostics) {
		ctx.addDiagnostic(diagnostic);
	}
	for (const diagnostic of toolDecisionDiagnostics(
		ctx,
		built.tools.decisions,
	)) {
		ctx.addDiagnostic(diagnostic);
	}
	ctx.outputContract.set(built.output);
	return built;
}

function toolDecisionDiagnostics(
	ctx: ResponsesContext,
	decisions: readonly PlannedToolDecision[],
): CompatibilityDiagnostic[] {
	return decisions.flatMap((decision): CompatibilityDiagnostic[] => {
		if (decision.action === "supported") return [];
		return [
			{
				code: "bridge.tool.compatibility",
				severity: decision.action === "rejected" ? "error" : "warn",
				path: decision.path,
				action: decision.action,
				message: decision.reason,
				metadata: {
					provider: ctx.resolved.provider,
					model: ctx.resolved.model,
				},
			},
		];
	});
}
