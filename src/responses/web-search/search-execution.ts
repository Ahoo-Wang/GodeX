import { PROVIDER_UPSTREAM_TIMEOUT, ProviderError } from "../../error";
import type { SearchRequest, SearchResponse } from "../../search";

export async function executeSearchWithTimeout(
	request: SearchRequest,
	timeoutMs: number,
	search: (signal: AbortSignal) => Promise<SearchResponse>,
): Promise<SearchResponse> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const searchPromise = search(controller.signal);
		// Absorb the abandoned search promise when the timeout wins the race:
		// abort() makes it reject (ProviderError/AbortError) with no awaiter,
		// which would surface as an unhandled rejection.
		searchPromise.catch(() => {});
		return await Promise.race([
			searchPromise,
			new Promise<SearchResponse>((_, reject) => {
				timeout = setTimeout(() => {
					controller.abort();
					reject(
						new ProviderError(
							PROVIDER_UPSTREAM_TIMEOUT,
							`web_search timed out after ${timeoutMs}ms.`,
							{
								provider: "web_search",
								model: "search",
								upstreamStatus: 408,
								upstreamBody: { query: request.query },
							},
						),
					);
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
