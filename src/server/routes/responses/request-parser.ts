import {
	SERVER_REQUEST_INVALID_JSON,
	SERVER_REQUEST_INVALID_PARAMETER,
} from "../../../error";
import type { Logger } from "../../../logger";
import type { ResponseCreateRequest } from "../../../protocol/openai";
import { jsonError } from "../../errors";

export type ParseResponseRequestResult =
	| { ok: true; body: ResponseCreateRequest }
	| { ok: false; response: Response };

export async function parseResponseRequest(
	req: Request,
	logger: Logger,
): Promise<ParseResponseRequestResult> {
	let parsedBody: unknown;
	try {
		parsedBody = await req.json();
	} catch (err) {
		logger.debug("responses.request.invalid_json", () => ({
			error: String(err),
		}));
		return {
			ok: false,
			response: jsonError(
				400,
				SERVER_REQUEST_INVALID_JSON,
				"Invalid JSON body",
			),
		};
	}

	if (
		parsedBody === null ||
		typeof parsedBody !== "object" ||
		Array.isArray(parsedBody)
	) {
		logger.debug("responses.request.invalid_body", () => ({
			body_type: parsedBody === null ? "null" : typeof parsedBody,
			array: Array.isArray(parsedBody),
		}));
		return {
			ok: false,
			response: jsonError(
				400,
				SERVER_REQUEST_INVALID_PARAMETER,
				"Request body must be a JSON object.",
			),
		};
	}

	const body = parsedBody as ResponseCreateRequest;
	if (body.previous_response_id && body.conversation) {
		logger.debug("responses.request.parameter.conflict", () => ({
			previous_response_id: body.previous_response_id,
			conversation: true,
		}));
		return {
			ok: false,
			response: jsonError(
				400,
				SERVER_REQUEST_INVALID_PARAMETER,
				"previous_response_id cannot be used together with conversation.",
			),
		};
	}

	return { ok: true, body };
}
