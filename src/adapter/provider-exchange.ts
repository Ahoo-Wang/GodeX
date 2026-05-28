import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import {
	type BuildChatCompletionRequestResult,
	buildChatCompletionRequest,
} from "../bridge/request";
import type { ToolPlanningProfile } from "../bridge/tools";
import type { ResponsesContext } from "../context/responses-context";
import { recordTraceEvent, recordTraceRequest } from "../trace";
import { ensureOutputContractSlot } from "./output-contract";

export interface ProviderRequestExchangeResult<ProviderResponse = unknown> {
	providerResponse: ProviderResponse;
	built: BuildChatCompletionRequestResult;
}

export interface ProviderStreamExchangeResult {
	providerStream: ReadableStream<JsonServerSentEvent<unknown>>;
	upstreamLatencyMillis: number;
}

export class ProviderExchange {
	async request(ctx: ResponsesContext): Promise<ProviderRequestExchangeResult> {
		const built = buildProviderRequest(ctx, false);
		const providerRequest = built.request;
		recordTraceRequest(ctx, false, providerRequest);
		recordTraceEvent(ctx, "provider.request.body", providerRequest);
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: false,
		}));

		const upstreamStart = Date.now();
		const providerResponse = await ctx.provider.request(providerRequest);
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
		recordTraceRequest(ctx, true, providerRequest);
		recordTraceEvent(ctx, "provider.request.body", providerRequest);
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: true,
		}));

		const upstreamStart = Date.now();
		const providerStream = await ctx.provider.stream(providerRequest);
		const upstreamLatencyMillis = Date.now() - upstreamStart;
		ctx.logger.debug("provider.stream.connected", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			upstreamLatencyMillis,
		}));

		return { providerStream, upstreamLatencyMillis };
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
		profile: toolPlanningProfile(ctx),
		session: ctx.session,
	});
	for (const diagnostic of built.compatibility.diagnostics) {
		ctx.addDiagnostic(diagnostic);
	}
	ensureOutputContractSlot(ctx).set(built.output);
	return built;
}

function toolPlanningProfile(ctx: ResponsesContext): ToolPlanningProfile {
	const capabilities = ctx.provider.spec.capabilities;
	const degraded = capabilities.tools.degraded ?? new Map<string, string>();
	return {
		provider: ctx.provider.name,
		nativeToolTypes: new Set(
			[...capabilities.tools.supported].filter((type) => !degraded.has(type)),
		),
		degradedToolTypes: degraded,
		toolChoice: capabilities.toolChoice.supported,
		maxTools: capabilities.tools.maxTools,
		toProviderName: ctx.provider.spec.toolName.toProviderName,
	};
}
