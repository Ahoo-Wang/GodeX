import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import type { Adapter } from "./adapter";
import type { StreamState } from "./mapper/stream-state";
import { ProviderEventToResponseTransformer } from "./transformers/provider-event-to-response-transformer";
import { ResponseSessionPersistenceTransformer } from "./transformers/response-session-persistence-transformer";
import { pipeTransform } from "./transformers/stream-utils";

export class DefaultAdapter implements Adapter {
	async request(ctx: ResponsesContext): Promise<ResponseObject> {
		const { mapper, chatClient } = ctx.provider;
		const req = await mapper.request.map(ctx);
		const res = await chatClient.chat(req);
		const response = await mapper.response.map(ctx, res);
		try {
			await saveSession(ctx.app.sessionStore, response, ctx);
		} catch (err) {
			ctx.logger.warn("session.save.error", {
				request_id: ctx.requestId,
				response_id: response.id,
				error: String(err),
			});
		}
		return response;
	}

	async stream(
		ctx: ResponsesContext,
	): Promise<ReadableStream<ResponseStreamEvent>> {
		const { mapper, chatClient } = ctx.provider;
		const req = await mapper.request.map(ctx);
		const events = await chatClient.streamChat(req);

		const eventStream = pipeTransform(
			events,
			new ProviderEventToResponseTransformer(mapper.stream, ctx),
		);

		if (ctx.request.store === false) {
			return eventStream;
		}

		return pipeTransform(
			eventStream,
			new ResponseSessionPersistenceTransformer({
				ctx,
				saveSession,
				buildResponseObject: async (
					ctx: ResponsesContext,
					state: StreamState,
				) => mapper.stream.buildResponseObject(ctx, state),
			}),
		);
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
	ctx.logger.debug("session.saved", { response_id: responseObject.id });
}
