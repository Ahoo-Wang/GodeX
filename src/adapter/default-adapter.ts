import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import {
	analyzePromptCache,
	recordTraceEvent,
	recordTraceUsage,
} from "../trace/integration";
import type { Adapter } from "./adapter";
import { logDiagnostics } from "./compatibility";
import { wrapWithErrorHandler } from "./stream-error-handler";
import { CompatibilityLogTransformer } from "./transformers/compatibility-log-transformer";
import { ProviderEventToResponseTransformer } from "./transformers/provider-event-to-response-transformer";
import { ResponseLogTransformer } from "./transformers/response-log-transformer";
import { ResponseSessionPersistenceTransformer } from "./transformers/response-session-persistence-transformer";
import {
	ATTR_UPSTREAM_LATENCY_MILLIS,
	pipeTransform,
} from "./transformers/stream-utils";
import { TraceTransformer } from "./transformers/trace-transformer";

export class DefaultAdapter implements Adapter {
	async request(ctx: ResponsesContext): Promise<ResponseObject> {
		const { mapper, client } = ctx.provider;
		const req = await mapper.request.map(ctx);
		analyzePromptCache(ctx, req);
		recordTraceEvent(ctx, "provider.request.body", req);
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: false,
		}));
		const upstreamStart = Date.now();
		const res = await client.request(req);
		recordTraceEvent(ctx, "provider.response.body", res);
		ctx.logger.debug("provider.response.received", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			upstreamDurationMillis: Date.now() - upstreamStart,
		}));
		const response = await mapper.response.map(ctx, res);
		recordTraceUsage(ctx, response.usage, (res as { usage?: unknown })?.usage);
		ctx.logger.info("responses.request.completed", () => ({
			status: response.status,
			model: response.model,
			outputCount: response.output.length,
			durationMillis: Date.now() - ctx.createdAt * 1000,
			usage: response.usage,
		}));
		logDiagnostics(ctx, {
			durationMillis: Date.now() - ctx.createdAt * 1000,
		});
		try {
			await saveSession(ctx.app.sessionStore, response, ctx);
		} catch (err) {
			ctx.logger.warn("session.save.error", () => ({
				request_id: ctx.requestId,
				response_id: response.id,
				error: String(err),
			}));
		}
		return response;
	}

	async stream(
		ctx: ResponsesContext,
	): Promise<ReadableStream<ResponseStreamEvent>> {
		const { mapper, client } = ctx.provider;
		const req = await mapper.request.map(ctx);
		analyzePromptCache(ctx, req);
		recordTraceEvent(ctx, "provider.request.body", req);
		ctx.logger.debug("provider.request.sending", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			stream: true,
		}));
		const upstreamStart = Date.now();
		const events = await client.stream(req);
		const upstreamLatencyMillis = Date.now() - upstreamStart;
		ctx.logger.debug("provider.stream.connected", () => ({
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			upstreamLatencyMillis,
		}));
		ctx.attributes.set(ATTR_UPSTREAM_LATENCY_MILLIS, upstreamLatencyMillis);

		const traceRawStream = pipeTransform(
			events,
			new TraceTransformer("upstream.stream.event.raw", ctx),
		);

		const eventStream = pipeTransform(
			traceRawStream,
			new ProviderEventToResponseTransformer(mapper.stream, ctx),
		);

		const errorSafeStream = wrapWithErrorHandler(eventStream, ctx);

		const traceTransformedStream = pipeTransform(
			errorSafeStream,
			new TraceTransformer("upstream.stream.event.transformed", ctx),
		);

		const logStream = pipeTransform(
			traceTransformedStream,
			new ResponseLogTransformer(ctx),
		);

		const sessionStream =
			ctx.request.store === false
				? logStream
				: pipeTransform(
						logStream,
						new ResponseSessionPersistenceTransformer({
							ctx,
							saveSession,
						}),
					);

		return pipeTransform(sessionStream, new CompatibilityLogTransformer(ctx));
	}
}

async function saveSession(
	store: ResponseSessionStore,
	responseObject: ResponseObject,
	ctx: ResponsesContext,
): Promise<void> {
	if (ctx.request.store === false) return;

	const session: StoredResponseSession = {
		id: responseObject.id,
		previous_response_id: ctx.request.previous_response_id ?? null,
		created_at: responseObject.created_at,
		completed_at: responseObject.completed_at ?? null,
		status: responseObject.status,
		request: {
			input: ctx.request.input,
			instructions: ctx.request.instructions,
			model: ctx.request.model,
			tools: ctx.request.tools,
			tool_choice: ctx.request.tool_choice,
			parallel_tool_calls: ctx.request.parallel_tool_calls,
			truncation: ctx.request.truncation,
		},
		response: {
			id: responseObject.id,
			output: responseObject.output,
			output_text: responseObject.output_text,
			usage: responseObject.usage,
			error: responseObject.error,
			incomplete_details: responseObject.incomplete_details,
		},
	};

	await store.save(session);
	ctx.logger.debug("session.saved", () => ({ response_id: responseObject.id }));
}
