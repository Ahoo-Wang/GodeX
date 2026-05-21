// src/error/session-error.ts
import { GodexError } from "./godex-error";

export interface SessionErrorContext {
	[key: string]: unknown;
	responseId?: string;
	previousResponseId?: string;
	maxDepth?: number;
}

export class SessionError extends GodexError {
	readonly domain = "session";

	constructor(
		code: string,
		message: string,
		context?: SessionErrorContext,
		options?: { status?: number; cause?: Error },
	) {
		super({
			code,
			message,
			status: options?.status ?? 400,
			context,
			cause: options?.cause,
		});
	}
}
