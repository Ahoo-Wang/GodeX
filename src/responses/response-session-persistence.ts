import type { ResponsesContext } from "../context/responses-context";
import type { ResponseObject } from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";

export async function saveResponseSession(
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
			reasoning: ctx.request.reasoning,
			text: ctx.request.text,
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
