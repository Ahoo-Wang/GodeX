import type { ProviderCapabilities } from "../../bridge/compatibility";
import type { ProviderStreamDelta } from "../../bridge/stream/stream-delta";
import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../../error";
import type { ChatCompletionCreateRequest as BridgeChatCompletionCreateRequest } from "../../protocol/openai/completions";
import type { ResponseUsage } from "../../protocol/openai/responses";
import { assertProviderChatRequest, mapCommonChatStreamDelta } from "../shared";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
	ChatCompletionStreamDelta,
	CompletionUsage,
	DeepSeekReasoningEffort,
} from "./protocol";

export const DEEPSEEK_MAX_TOOLS = 128;

export const DEEPSEEK_SPEC_CAPABILITIES: ProviderCapabilities = {
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
		supported: new Set([
			"function",
			"local_shell",
			"shell",
			"apply_patch",
			"custom",
			"namespace",
		]),
		degraded: new Map([
			["local_shell", "function"],
			["shell", "function"],
			["apply_patch", "function"],
			["custom", "function"],
			["namespace", "function"],
		]),
		maxTools: DEEPSEEK_MAX_TOOLS,
	},
	toolChoice: { supported: new Set(["auto", "none", "required", "function"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
	},
	reasoning: { effort: "native" },
	streaming: { usage: true },
};

export function deepSeekFirstChoice(
	response: ChatCompletion,
): ChatCompletion["choices"][0] | undefined {
	return response.choices?.[0];
}

export function deepSeekFinishReason(
	response: ChatCompletion,
): string | undefined {
	return deepSeekFirstChoice(response)?.finish_reason;
}

export function deepSeekOutputText(response: ChatCompletion): string {
	return extractDeepSeekText(deepSeekFirstChoice(response)?.message.content);
}

export function mapDeepSeekSpecUsage(
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
	if (usage.prompt_cache_hit_tokens !== undefined) {
		assertFiniteNumber(
			usage.prompt_cache_hit_tokens,
			"usage.prompt_cache_hit_tokens",
		);
		result.input_tokens_details = {
			cached_tokens: usage.prompt_cache_hit_tokens,
		};
	}
	const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
	if (reasoningTokens !== undefined) {
		assertFiniteNumber(
			reasoningTokens,
			"usage.completion_tokens_details.reasoning_tokens",
		);
		result.output_tokens_details = { reasoning_tokens: reasoningTokens };
	}
	return result;
}

export function deepSeekResponseUsage(
	response: ChatCompletion,
): ResponseUsage | null {
	return mapDeepSeekSpecUsage(response.usage);
}

export function deepSeekPatchRequest(
	request: BridgeChatCompletionCreateRequest,
): ChatCompletionRequest {
	assertProviderChatRequest("deepseek", request);
	const effort = deepSeekReasoningEffort(request.reasoning_effort);
	const { reasoning_effort: _reasoningEffort, ...providerRequest } = request;
	if (effort) {
		return {
			...providerRequest,
			thinking: { type: "enabled" },
			reasoning_effort: effort,
		} as unknown as ChatCompletionRequest;
	}
	if (hasHistoricalReasoningContent(providerRequest.messages)) {
		return {
			...providerRequest,
			thinking: { type: "enabled" },
		} as unknown as ChatCompletionRequest;
	}
	return {
		...providerRequest,
		thinking: { type: "disabled" },
	} as unknown as ChatCompletionRequest;
}

function hasHistoricalReasoningContent(
	messages: BridgeChatCompletionCreateRequest["messages"],
): boolean {
	return messages.some(
		(message) =>
			message.role === "assistant" &&
			typeof message.reasoning_content === "string" &&
			message.reasoning_content.length > 0,
	);
}

export function deepSeekStreamDeltas(
	chunk: ChatCompletionChunk,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	const usage = mapDeepSeekSpecUsage(chunk.usage);
	if (usage) {
		deltas.push({ usage });
	}
	for (const choice of chunk.choices ?? []) {
		deltas.push(...mapDeepSeekChoiceDelta(choice.delta ?? {}));
		if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
			deltas.push({ finishReason: choice.finish_reason });
		}
	}
	return deltas;
}

function mapDeepSeekChoiceDelta(
	delta: ChatCompletionStreamDelta,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	if (delta.content) {
		deltas.push({ text: delta.content });
	}
	deltas.push(...mapCommonChatStreamDelta(delta));
	return deltas;
}

function extractDeepSeekText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter(isTextPart)
			.map((part) => part.text)
			.join("");
	}
	return "";
}

function isTextPart(value: unknown): value is { type: "text"; text: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "text" &&
		"text" in value &&
		typeof value.text === "string"
	);
}

function assertFiniteNumber(
	value: unknown,
	path: string,
): asserts value is number {
	if (typeof value === "number" && Number.isFinite(value)) return;
	throw new ProviderError(
		PROVIDER_UPSTREAM_ERROR,
		`DeepSeek returned invalid ${path}.`,
		{
			provider: "deepseek",
			model: "unknown",
			upstreamStatus: 502,
			parameter: path,
		},
	);
}

function deepSeekReasoningEffort(
	effort: unknown,
): DeepSeekReasoningEffort | undefined {
	switch (effort) {
		case "high":
			return "high";
		case "xhigh":
			return "max";
		default:
			return undefined;
	}
}
