// src/error/server-error.ts
import { GodeXError } from "./godex-error";

export interface ServerErrorContext {
	[key: string]: unknown;
	path?: string;
	method?: string;
}

export class ServerError extends GodeXError {
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
