import { ExchangeError } from "@ahoo-wang/fetcher";
import type { ProviderClient } from "../../adapter/provider";
import {
	PROVIDER_UPSTREAM_ERROR,
	PROVIDER_UPSTREAM_TIMEOUT,
	ProviderError,
} from "../../error";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../protocol/openai/completions";
import { openAIChatApi } from "./api/api";

export class OpenAIClient
	implements
		ProviderClient<
			ChatCompletionCreateRequest,
			ChatCompletion,
			ChatCompletionChunk
		>
{
	private readonly api;

	constructor(baseURL: string, apiKey: string, timeout?: number) {
		this.api = openAIChatApi({ baseURL, apiKey, timeout });
	}

	async request(body: ChatCompletionCreateRequest): Promise<ChatCompletion> {
		try {
			return await this.api.chatCompletions(body);
		} catch (err) {
			throw await wrapProviderError(err);
		}
	}

	async stream(body: ChatCompletionCreateRequest) {
		try {
			return await this.api.streamChatCompletions({ ...body, stream: true });
		} catch (err) {
			throw await wrapProviderError(err);
		}
	}
}

async function wrapProviderError(err: unknown): Promise<unknown> {
	if (
		err instanceof Error &&
		(err.name === "FetchTimeoutError" || err.name === "TimeoutError")
	) {
		return new ProviderError(PROVIDER_UPSTREAM_TIMEOUT, "Request timed out", {
			provider: "openai",
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
			provider: "openai",
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
