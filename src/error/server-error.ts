// src/error/server-error.ts
import { GodexError } from "./godex-error";

export interface ServerErrorContext {
	[key: string]: unknown;
	path?: string;
	method?: string;
}

export class ServerError extends GodexError {
	readonly domain = "server";

	constructor(
		code: string,
		message: string,
		context?: ServerErrorContext,
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
