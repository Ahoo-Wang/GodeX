import { isRecord } from "../../common";
import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../../error";
import type { ChatCompletionCreateRequest } from "../../protocol/openai/completions";

export function assertProviderChatRequest(
	provider: string,
	request: unknown,
): asserts request is ChatCompletionCreateRequest {
	if (
		isRecord(request) &&
		typeof request.model === "string" &&
		request.model.length > 0 &&
		Array.isArray(request.messages)
	) {
		return;
	}
	throw new ProviderError(
		PROVIDER_UPSTREAM_ERROR,
		`Provider ${provider} patchRequest produced an invalid chat completion request.`,
		{
			provider,
			model: modelOf(request),
			upstreamStatus: 0,
			parameter: "request",
		},
	);
}

function modelOf(request: unknown): string {
	if (isRecord(request) && typeof request.model === "string") {
		return request.model;
	}
	return "unknown";
}
