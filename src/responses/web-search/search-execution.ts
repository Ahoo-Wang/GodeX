import { BRIDGE_REQUEST_UNSUPPORTED_TOOL, BridgeError } from "../../error";
import type { SearchRequest, SearchResponse } from "../../search";

export async function executeSearchWithTimeout(
	request: SearchRequest,
	timeoutMs: number,
	search: (signal: AbortSignal) => Promise<SearchResponse>,
): Promise<SearchResponse> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			search(controller.signal),
			new Promise<SearchResponse>((_, reject) => {
				timeout = setTimeout(() => {
					controller.abort();
					reject(
						new BridgeError(
							BRIDGE_REQUEST_UNSUPPORTED_TOOL,
							`web_search timed out after ${timeoutMs}ms.`,
							{
								provider: "web_search",
								model: "search",
								parameter: "web_search.timeout_ms",
								query: request.query,
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
