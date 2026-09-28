import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { ResponseSseEncoder } from "../../../responses/stream-transforms/response-sse-encoder";
import { pipeTransform } from "../../../responses/stream-transforms/stream-utils";
import { sseHeaders } from "./sse";

export async function dispatchResponseRequest(
	ctx: ResponsesContext,
	app: ApplicationContext,
): Promise<Response> {
	if (ctx.request.stream) {
		const eventStream = await app.responses.stream(ctx);
		const sseBody = pipeTransform(eventStream, new ResponseSseEncoder());
		return new Response(sseBody, {
			headers: sseHeaders(),
		});
	}

	const responseObject = await app.responses.request(ctx);
	return Response.json(responseObject);
}
