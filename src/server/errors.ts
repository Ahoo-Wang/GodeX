import type { GodeXError, ProviderError } from "../error";

export interface ErrorPayload {
	code: string;
	message: string;
}

export interface HttpError {
	status: number;
	error: ErrorPayload;
}

export function godeXErrorToHttp(err: GodeXError): HttpError {
	return {
		status: err.status,
		error: { code: err.code, message: err.message },
	};
}

export function providerErrorToHttp(err: ProviderError): HttpError {
	const upstreamStatus = err.context.upstreamStatus as number;
	if (upstreamStatus === 429) {
		return {
			status: 429,
			error: { code: "rate_limit_exceeded", message: "Rate limit exceeded" },
		};
	}
	if (upstreamStatus === 408) {
		return {
			status: 408,
			error: { code: "request_timeout", message: err.message },
		};
	}
	if (upstreamStatus >= 500) {
		return {
			status: 502,
			error: { code: "upstream_error", message: "Upstream provider error" },
		};
	}
	return {
		status: 422,
		error: { code: "upstream_error", message: err.message },
	};
}

export function providerErrorToPayload(err: ProviderError): ErrorPayload {
	return providerErrorToHttp(err).error;
}

export function jsonError(
	status: number,
	code: string,
	message: string,
	options: { requestId?: string } = {},
): Response {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (options.requestId) headers.set("x-request-id", options.requestId);

	return new Response(JSON.stringify({ error: { code, message } }), {
		status,
		headers,
	});
}

export function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}
