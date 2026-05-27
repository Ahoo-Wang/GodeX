import { ResponseSseEncodeTransformer } from "../../../adapter/transformers/response-sse-encode-transformer";
import { pipeTransform } from "../../../adapter/transformers/stream-utils";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { sseHeaders } from "./sse";

export async function dispatchResponseRequest(
	ctx: ResponsesContext,
	app: ApplicationContext,
): Promise<Response> {
	if (ctx.request.stream) {
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
}
