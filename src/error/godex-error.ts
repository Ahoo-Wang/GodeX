// src/error/godex-error.ts
export abstract class GodexError extends Error {
	abstract readonly domain: string;
	readonly code: string;
	readonly status: number;
	readonly context: Record<string, unknown>;
	readonly timestamp: number;

	constructor(options: {
		code: string;
		message: string;
		status: number;
		context?: Record<string, unknown>;
		cause?: Error;
	}) {
		super(options.message, { cause: options.cause });
		this.name = this.constructor.name;
		this.code = options.code;
		this.status = options.status;
		this.context = options.context ?? {};
		this.timestamp = Date.now();
	}

	toLogEntry(): Record<string, unknown> {
		return {
			domain: this.domain,
			code: this.code,
			message: this.message,
			status: this.status,
			timestamp: this.timestamp,
			...this.context,
			...(this.cause ? { cause: (this.cause as Error).message } : {}),
		};
	}
}

export function toLogEntry(err: unknown): Record<string, unknown> {
	if (err instanceof GodexError) return err.toLogEntry();
	return { message: String(err) };
}
