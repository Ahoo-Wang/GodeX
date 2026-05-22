import { ResponseSseEncodeTransformer } from "../../../adapter/transformers/response-sse-encode-transformer";
import { pipeTransform } from "../../../adapter/transformers/stream-utils";
import type { ApplicationContext } from "../../../context/application-context";
import { ResponsesContext } from "../../../context/responses-context";
import {
	GodexError,
	ProviderError,
	SERVER_ERROR,
	SERVER_REQUEST_INVALID_JSON,
	SERVER_REQUEST_INVALID_PARAMETER,
	toLogEntry,
} from "../../../error";
import type { ResponseCreateRequest } from "../../../protocol/openai";
import { jsonError, providerErrorToHttp } from "../../errors";
import { sseHeaders } from "./sse";

export async function handleResponses(
	req: Request,
	app: ApplicationContext,
): Promise<Response> {
	const { logger } = app;

	let body: ResponseCreateRequest;
	try {
		body = (await req.json()) as ResponseCreateRequest;
	} catch {
		return jsonError(400, SERVER_REQUEST_INVALID_JSON, "Invalid JSON body");
	}

	if (body.previous_response_id && body.conversation) {
		return jsonError(
			400,
			SERVER_REQUEST_INVALID_PARAMETER,
			"previous_response_id cannot be used together with conversation.",
		);
	}

	let requestId: string | undefined;
	try {
		const ctx = await ResponsesContext.create(app, body);
		requestId = ctx.requestId;

		logger.info("responses.request.received", {
			model: body.model,
			resolved: ctx.resolved,
			stream: body.stream,
			previous_response_id: body.previous_response_id,
			store: body.store,
			input_count: Array.isArray(body.input)
				? body.input.length
				: body.input
					? 1
					: 0,
			safety_identifier: body.safety_identifier,
			prompt_cache_key: body.prompt_cache_key,
			prompt_cache_retention: body.prompt_cache_retention,
			service_tier: body.service_tier,
			background: body.background,
			max_tool_calls: body.max_tool_calls,
			parallel_tool_calls: body.parallel_tool_calls,
			context_management: body.context_management,
		});

		if (body.stream) {
			const eventStream = await app.adapter.stream(ctx);
			const sseBody = pipeTransform(
				eventStream,
				new ResponseSseEncodeTransformer(),
			);
			return new Response(sseBody, {
				headers: sseHeaders(),
			});
		}

		const responseObject = await app.adapter.request(ctx);
		return Response.json(responseObject);
	} catch (err) {
		if (err instanceof ProviderError) {
			logger.error("responses.request.provider.error", () => err.toLogEntry());
			const mapped = providerErrorToHttp(err);
			return jsonError(mapped.status, mapped.error.code, mapped.error.message, {
				requestId,
			});
		}
		if (err instanceof GodexError) {
			logger.warn("responses.request.error", err.toLogEntry());
			return jsonError(err.status, err.code, err.message, {
				requestId,
			});
		}
		logger.error("godex.unexpected.error", () => ({
			...toLogEntry(err),
			request_id: requestId,
		}));
		return jsonError(500, SERVER_ERROR, "Internal server error", {
			requestId,
		});
	}
}
