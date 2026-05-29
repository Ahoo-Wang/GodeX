import type { ProviderCapabilities } from "../../bridge/compatibility";
import type { ProviderStreamDelta } from "../../bridge/stream/stream-delta";
import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../../error";
import type { ResponseUsage } from "../../protocol/openai/responses";
import type {
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
	ChatCompletionResponse,
	ChatCompletionResponseMessage,
	ChatCompletionStreamDelta,
	CompletionUsage,
} from "./protocol";

export const ZHIPU_SUPPORTED_TOOL_TYPES: ReadonlySet<string> = new Set([
	"function",
	"web_search",
	"web_search_2025_08_26",
	"web_search_preview",
	"web_search_preview_2025_03_11",
	"file_search",
	"mcp",
	"local_shell",
	"shell",
	"apply_patch",
	"custom",
	"tool_search",
	"namespace",
]);

export const ZHIPU_MAX_TOOLS = 128;

export const ZHIPU_SPEC_CAPABILITIES: ProviderCapabilities = {
	parameters: {
		supported: new Set([
			"stream",
			"temperature",
			"top_p",
			"max_output_tokens",
			"safety_identifier",
			"user",
			"reasoning",
			"text.format",
		]),
	},
	tools: {
		supported: ZHIPU_SUPPORTED_TOOL_TYPES,
		degraded: new Map([
			["web_search_2025_08_26", "web_search"],
			["web_search_preview", "web_search"],
			["web_search_preview_2025_03_11", "web_search"],
			["file_search", "retrieval"],
			["local_shell", "function"],
			["shell", "function"],
			["apply_patch", "function"],
			["custom", "function"],
			["tool_search", "function"],
			["namespace", "function"],
		]),
		maxTools: ZHIPU_MAX_TOOLS,
	},
	toolChoice: { supported: new Set(["auto", "none"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
		degraded: new Map([["json_schema", "json_object"]]),
	},
	reasoning: { effort: "boolean" },
	streaming: { usage: true },
};

export function zhipuFirstChoice(
	response: ChatCompletionResponse,
): ChatCompletionResponse["choices"][0] | undefined {
	return response.choices?.[0];
}

export function zhipuFinishReason(
	response: ChatCompletionResponse,
): string | undefined {
	return zhipuFirstChoice(response)?.finish_reason;
}

export function zhipuOutputText(response: ChatCompletionResponse): string {
	return extractZhipuMessageText(zhipuFirstChoice(response)?.message);
}

export function mapZhipuUsage(
	usage: CompletionUsage | null | undefined,
): ResponseUsage | null {
	if (!usage) return null;
	assertFiniteNumber(usage.prompt_tokens, "usage.prompt_tokens");
	assertFiniteNumber(usage.completion_tokens, "usage.completion_tokens");
	assertFiniteNumber(usage.total_tokens, "usage.total_tokens");
	const result: ResponseUsage = {
		input_tokens: usage.prompt_tokens,
		output_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens,
	};
	const cached = usage.prompt_tokens_details?.cached_tokens;
	if (cached !== undefined) {
		assertFiniteNumber(cached, "usage.prompt_tokens_details.cached_tokens");
		result.input_tokens_details = { cached_tokens: cached };
	}
	return result;
}

export function zhipuResponseUsage(
	response: ChatCompletionResponse,
): ResponseUsage | null {
	return mapZhipuUsage(response.usage);
}

export function zhipuPatchRequest(
	request: ChatCompletionCreateRequest,
): ChatCompletionCreateRequest {
	const bridgeRequest = request as ChatCompletionCreateRequest & {
		readonly reasoning_effort?: unknown;
	};
	if (bridgeRequest.reasoning_effort === undefined) return request;
	const { reasoning_effort, ...providerRequest } = bridgeRequest;
	return {
		...providerRequest,
		thinking: {
			type: reasoning_effort === "none" ? "disabled" : "enabled",
		},
	} as ChatCompletionCreateRequest;
}

export function zhipuStreamDeltas(
	chunk: ChatCompletionChunk,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	const usage = mapZhipuUsage(chunk.usage);
	if (usage) {
		deltas.push({ usage });
	}
	for (const choice of chunk.choices ?? []) {
		deltas.push(...mapZhipuChoiceDelta(choice.delta ?? {}));
		if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
			deltas.push({ finishReason: choice.finish_reason });
		}
	}
	return deltas;
}

function mapZhipuChoiceDelta(
	delta: ChatCompletionStreamDelta,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	const text = extractZhipuText(delta.content);
	if (text.length > 0) {
		deltas.push({ text });
	}
	if (delta.reasoning_content) {
		deltas.push({ reasoning: delta.reasoning_content });
	}
	for (const toolCall of delta.tool_calls ?? []) {
		const providerToolCall = {
			...(toolCall.index !== undefined ? { index: toolCall.index } : {}),
			...(toolCall.id !== undefined ? { id: toolCall.id } : {}),
			...(toolCall.type !== undefined ? { type: toolCall.type } : {}),
			...(toolCall.function?.name !== undefined
				? { name: toolCall.function.name }
				: {}),
			...(toolCall.function?.arguments !== undefined
				? { arguments: toolCall.function.arguments }
				: {}),
		};
		if (Object.keys(providerToolCall).length > 0) {
			deltas.push({ toolCall: providerToolCall });
		}
	}
	return deltas;
}

function extractZhipuMessageText(
	message: ChatCompletionResponseMessage | undefined,
): string {
	return extractZhipuText(message?.content);
}

function extractZhipuText(
	content: ChatCompletionResponseMessage["content"] | undefined,
): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("");
	}
	return "";
}

function assertFiniteNumber(
	value: unknown,
	path: string,
): asserts value is number {
	if (typeof value === "number" && Number.isFinite(value)) return;
	throw new ProviderError(
		PROVIDER_UPSTREAM_ERROR,
		`Zhipu returned invalid ${path}.`,
		{
			provider: "zhipu",
			model: "unknown",
			upstreamStatus: 502,
			parameter: path,
		},
	);
}
