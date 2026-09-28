import {
	PROVIDER_UPSTREAM_ERROR,
	PROVIDER_UPSTREAM_RATE_LIMIT,
	PROVIDER_UPSTREAM_SERVER_ERROR,
	PROVIDER_UPSTREAM_TIMEOUT,
	ProviderError,
} from "../error";
import type { SearchRequest, SearchResponse, SearchService } from "./types";

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

export interface ZhipuSearchProviderOptions {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly timeoutMs?: number;
}

interface ZhipuSearchResult {
	readonly title?: unknown;
	readonly content?: unknown;
	readonly link?: unknown;
	readonly publish_date?: unknown;
}

interface ZhipuSearchResponse {
	readonly search_result?: unknown;
}

export class ZhipuSearchProvider implements SearchService {
	readonly name = "zhipu";
	readonly available = true;

	constructor(private readonly options: ZhipuSearchProviderOptions) {}

	async search(
		request: SearchRequest,
		signal?: AbortSignal,
	): Promise<SearchResponse> {
		const response = await this.fetchSearch(request, signal);
		const body = (await response.json()) as ZhipuSearchResponse;
		const results = Array.isArray(body.search_result)
			? body.search_result.filter(isZhipuSearchResult)
			: [];
		return {
			query: request.query,
			results: results.flatMap((result) => {
				if (typeof result.link !== "string" || result.link.length === 0) {
					return [];
				}
				return [
					{
						...(typeof result.title === "string"
							? { title: result.title }
							: {}),
						url: result.link,
						...(typeof result.content === "string"
							? { snippet: result.content }
							: {}),
						...(typeof result.publish_date === "string"
							? { publishedAt: result.publish_date }
							: {}),
					},
				];
			}),
		};
	}

	private async fetchSearch(
		request: SearchRequest,
		signal: AbortSignal | undefined,
	): Promise<FetchResponse> {
		try {
			const response = await fetch(webSearchUrl(this.options.baseURL), {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.options.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(zhipuSearchBody(request)),
				...(signal ? { signal } : {}),
			});
			if (response.ok) return response;
			throw new ProviderError(
				providerErrorCode(response.status),
				await responseErrorMessage(response),
				{
					provider: this.name,
					model: "web_search",
					upstreamStatus: response.status,
					upstreamBody: await safeResponseJson(response.clone()),
				},
			);
		} catch (err) {
			if (err instanceof ProviderError) throw err;
			if (
				err instanceof Error &&
				(err.name === "AbortError" ||
					err.name === "FetchTimeoutError" ||
					err.name === "TimeoutError")
			) {
				throw new ProviderError(
					PROVIDER_UPSTREAM_TIMEOUT,
					"Request timed out",
					{
						provider: this.name,
						model: "web_search",
						upstreamStatus: 408,
					},
					{ cause: err },
				);
			}
			throw new ProviderError(
				PROVIDER_UPSTREAM_ERROR,
				err instanceof Error ? err.message : String(err),
				{
					provider: this.name,
					model: "web_search",
					upstreamStatus: 502,
				},
				err instanceof Error ? { cause: err } : undefined,
			);
		}
	}
}

function zhipuSearchBody(request: SearchRequest): Record<string, unknown> {
	return {
		search_query: request.query,
		search_engine: "search_std",
		search_intent: false,
		count: 10,
		...(request.allowedDomains?.[0]
			? { search_domain_filter: request.allowedDomains[0] }
			: {}),
		content_size: request.contextSize === "high" ? "high" : "medium",
	};
}

function webSearchUrl(baseURL: string): string {
	return `${baseURL.replace(/\/+$/g, "")}/web_search`;
}

function isZhipuSearchResult(value: unknown): value is ZhipuSearchResult {
	return typeof value === "object" && value !== null;
}

function providerErrorCode(status: number): string {
	if (status === 408) return PROVIDER_UPSTREAM_TIMEOUT;
	if (status === 429) return PROVIDER_UPSTREAM_RATE_LIMIT;
	if (status >= 500) return PROVIDER_UPSTREAM_SERVER_ERROR;
	return PROVIDER_UPSTREAM_ERROR;
}

async function responseErrorMessage(response: FetchResponse): Promise<string> {
	const body = await safeResponseJson(response.clone());
	if (typeof body === "object" && body !== null && "error" in body) {
		const error = (body as { error: unknown }).error;
		if (typeof error === "object" && error !== null && "message" in error) {
			return String((error as { message: unknown }).message);
		}
		return String(error);
	}
	return `Upstream returned ${response.status}`;
}

async function safeResponseJson(response: {
	json(): Promise<unknown>;
}): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}
