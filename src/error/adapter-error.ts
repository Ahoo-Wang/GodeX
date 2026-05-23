// src/error/adapter-error.ts
import { GodeXError } from "./godex-error";

export interface AdapterErrorContext {
	[key: string]: unknown;
	provider: string;
	model: string;
	parameter?: string;
}

export class AdapterError extends GodeXError {
	readonly domain = "adapter";

	constructor(
		code: string,
		message: string,
		context: AdapterErrorContext,
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
