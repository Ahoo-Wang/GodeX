import { ExchangeError } from "@ahoo-wang/fetcher";
import type { ProviderClient } from "../../adapter/provider";
import {
	PROVIDER_UPSTREAM_ERROR,
	PROVIDER_UPSTREAM_RATE_LIMIT,
	PROVIDER_UPSTREAM_SERVER_ERROR,
	PROVIDER_UPSTREAM_TIMEOUT,
	ProviderError,
} from "../../error";
import type { ChatApi, ChatApiOptions } from "./chat-api";
import { chatApi } from "./chat-api";

export interface ChatProviderClientOptions extends ChatApiOptions {
	provider: string;
}

type StreamableRequest = { stream?: boolean };

export class ChatProviderClient<TReq extends StreamableRequest, TRes, TChunk>
	implements ProviderClient<TReq, TRes, TChunk>
{
	private readonly api: ChatApi<TReq, TRes, TChunk>;
	private readonly provider: string;

	constructor(options: ChatProviderClientOptions) {
		this.api = chatApi(options);
		this.provider = options.provider;
	}

	async request(body: TReq): Promise<TRes> {
		try {
			return await this.api.chatCompletions(body);
		} catch (err) {
			throw await wrapProviderError(err, this.provider);
		}
	}

	async stream(body: TReq) {
		try {
			return await this.api.streamChatCompletions({
				...body,
				stream: true,
			} as TReq);
		} catch (err) {
			throw await wrapProviderError(err, this.provider);
		}
	}
}

async function wrapProviderError(
	err: unknown,
	provider: string,
): Promise<unknown> {
	if (
		err instanceof Error &&
		(err.name === "FetchTimeoutError" || err.name === "TimeoutError")
	) {
		return new ProviderError(PROVIDER_UPSTREAM_TIMEOUT, "Request timed out", {
			provider,
			model: "unknown",
			upstreamStatus: 408,
		});
	}

	if (err instanceof ExchangeError) {
		const { exchange } = err;
		const hasResponse = exchange.response !== undefined;
		const status = exchange.response?.status ?? 502;
		const body = await safeResponseJson(exchange.response);
		const message =
			typeof body === "object" && body !== null && "error" in body
				? extractErrorMessage((body as { error: unknown }).error)
				: hasResponse
					? `Upstream returned ${status}`
					: "Upstream request failed";
		return new ProviderError(
			hasResponse ? providerErrorCode(status) : PROVIDER_UPSTREAM_ERROR,
			message,
			{
				provider,
				model: "unknown",
				upstreamStatus: status,
				upstreamBody: body,
			},
		);
	}

	const message = err instanceof Error ? err.message : String(err);
	return new ProviderError(
		PROVIDER_UPSTREAM_ERROR,
		message || "Upstream request failed",
		{
			provider,
			model: "unknown",
			upstreamStatus: 502,
		},
		err instanceof Error ? { cause: err } : undefined,
	);
}

function providerErrorCode(status: number): string {
	if (status === 408) return PROVIDER_UPSTREAM_TIMEOUT;
	if (status === 429) return PROVIDER_UPSTREAM_RATE_LIMIT;
	if (status >= 500) return PROVIDER_UPSTREAM_SERVER_ERROR;
	return PROVIDER_UPSTREAM_ERROR;
}

function extractErrorMessage(error: unknown): string {
	if (typeof error === "string") return error;
	if (typeof error === "object" && error !== null && "message" in error) {
		return String((error as { message: unknown }).message);
	}
	return String(error);
}

async function safeResponseJson(
	response: Response | undefined,
): Promise<unknown> {
	if (!response) return null;
	try {
		return await response.json();
	} catch {
		return null;
	}
}
