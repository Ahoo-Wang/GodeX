// src/error/provider-error.ts
import { GodeXError } from "./godex-error";

export interface ProviderErrorContext {
	[key: string]: unknown;
	provider: string;
	model: string;
	upstreamStatus: number;
	upstreamBody?: unknown;
}

export class ProviderError extends GodeXError {
	readonly domain = "provider";

	constructor(
		code: string,
		message: string,
		context: ProviderErrorContext,
		options?: { cause?: Error },
	) {
		super({
			code,
			message,
			status: 502,
			context,
			cause: options?.cause,
		});
	}
}
