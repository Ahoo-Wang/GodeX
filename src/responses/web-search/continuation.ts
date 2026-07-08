import type {
	ResponseCreateRequest,
	ResponseItem,
} from "../../protocol/openai/responses";
import type { SearchResponse } from "../../search";

export function buildContinuationRequest(input: {
	readonly original: ResponseCreateRequest;
	readonly previousItems: readonly ResponseItem[];
	readonly callId: string;
	readonly search: SearchResponse;
}): ResponseCreateRequest {
	return {
		...input.original,
		input: [
			...currentInputItems(input.original),
			...input.previousItems,
			{
				type: "function_call_output",
				call_id: input.callId,
				output: searchOutputText(input.search),
				status: "completed",
				created_by: "server",
			},
		],
	};
}

function currentInputItems(request: ResponseCreateRequest): ResponseItem[] {
	if (request.input === undefined) return [];
	if (typeof request.input === "string") {
		return [{ role: "user", content: request.input }];
	}
	return [...request.input] as ResponseItem[];
}

function searchOutputText(search: SearchResponse): string {
	return JSON.stringify({
		query: search.query,
		results: search.results.map((result) => ({
			title: result.title,
			url: result.url,
			snippet: result.snippet,
			published_at: result.publishedAt,
		})),
	});
}
