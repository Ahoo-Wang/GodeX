import { ExchangeError } from "@ahoo-wang/fetcher";
import type { ProviderClient } from "../../adapter/provider";
import {
	PROVIDER_UPSTREAM_ERROR,
	PROVIDER_UPSTREAM_TIMEOUT,
	ProviderError,
} from "../../error";
import type { ChatApi, ChatApiOptions } from "./chat-api";
import { chatApi } from "./chat-api";

export interface ChatProviderClientOptions extends ChatApiOptions {
	provider: string;
}

export class ChatProviderClient<TReq, TRes, TChunk>
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
		const status = exchange.response?.status ?? 502;
		const body = await safeResponseJson(exchange.response);
		const message =
			typeof body === "object" && body !== null && "error" in body
				? extractErrorMessage((body as { error: unknown }).error)
				: `Upstream returned ${status}`;
		return new ProviderError(PROVIDER_UPSTREAM_ERROR, message, {
			provider,
			model: "unknown",
			upstreamStatus: status,
			upstreamBody: body,
		});
	}

	return err;
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
