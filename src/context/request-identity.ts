import { nanoid } from "nanoid";
import type { Logger } from "../logger";

export interface RequestIdentity {
	requestId: string;
	responseId: string;
	createdAt: number;
	logger: Logger;
}

export function createRequestIdentity(logger: Logger): RequestIdentity {
	const requestId = `req_${nanoid()}`;
	const responseId = `resp_${nanoid()}`;
	return {
		requestId,
		responseId,
		createdAt: Math.floor(Date.now() / 1000),
		logger: logger.child({
			request_id: requestId,
			response_id: responseId,
		}),
	};
}
