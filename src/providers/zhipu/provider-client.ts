import { ExchangeError } from "@ahoo-wang/fetcher";
import type { ProviderClient } from "../../adapter/provider";
import {
	PROVIDER_UPSTREAM_ERROR,
	PROVIDER_UPSTREAM_TIMEOUT,
	ProviderError,
} from "../../error";
import { zhipuApi } from "./api/api";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "./protocol/completions";

export class ZhipuClient
	implements
		ProviderClient<
			ChatCompletionTextRequest,
			ChatCompletionResponse,
			ChatCompletionChunk
		>
{
	private readonly api;

	constructor(baseURL: string, apiKey: string, timeout?: number) {
		this.api = zhipuApi({ baseURL, apiKey, timeout });
	}

	async request(
		body: ChatCompletionTextRequest,
	): Promise<ChatCompletionResponse> {
		try {
			return await this.api.chatCompletions(body);
		} catch (err) {
			throw await wrapProviderError(err);
		}
	}

	async stream(body: ChatCompletionTextRequest) {
		try {
			return await this.api.streamChatCompletions({ ...body, stream: true });
		} catch (err) {
			throw await wrapProviderError(err);
		}
	}
}

function extractErrorMessage(error: unknown): string {
	if (typeof error === "string") return error;
	if (typeof error === "object" && error !== null && "message" in error) {
		return String((error as { message: unknown }).message);
	}
	return String(error);
}

async function wrapProviderError(err: unknown): Promise<unknown> {
	if (
		err instanceof Error &&
		(err.name === "FetchTimeoutError" || err.name === "TimeoutError")
	) {
		return new ProviderError(PROVIDER_UPSTREAM_TIMEOUT, "Request timed out", {
			provider: "zhipu",
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
			provider: "zhipu",
			model: "unknown",
			upstreamStatus: status,
			upstreamBody: body,
		});
	}

	return err;
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
