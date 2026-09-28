// src/error/bridge-error.ts
import { GodeXError } from "./godex-error";

export interface BridgeErrorContext {
	[key: string]: unknown;
	provider: string;
	model: string;
	parameter?: string;
}

export class BridgeError extends GodeXError {
	readonly domain = "bridge";

	constructor(
		code: string,
		message: string,
		context: BridgeErrorContext,
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

export function createBridgeFailure(
	code: string,
	message: string,
	context: BridgeErrorContext,
	options?: { status?: number; cause?: Error },
): BridgeError {
	return new BridgeError(code, message, context, options);
}
