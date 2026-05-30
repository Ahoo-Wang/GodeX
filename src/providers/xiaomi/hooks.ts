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
} from "./protocol";

export const XIAOMI_MAX_TOOLS = 128;

export const XIAOMI_SPEC_CAPABILITIES: ProviderCapabilities = {
	parameters: {
		supported: new Set([
			"stream",
			"temperature",
			"top_p",
			"max_output_tokens",
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
		maxTools: XIAOMI_MAX_TOOLS,
	},
	toolChoice: { supported: new Set(["auto"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
	},
	reasoning: { effort: "boolean" },
	streaming: { usage: true },
};

export function xiaomiFirstChoice(
	response: ChatCompletion,
): ChatCompletion["choices"][0] | undefined {
	return response.choices?.[0];
}

export function xiaomiFinishReason(
	response: ChatCompletion,
): string | undefined {
	return xiaomiFirstChoice(response)?.finish_reason;
}

export function xiaomiOutputText(response: ChatCompletion): string {
	return extractXiaomiText(xiaomiFirstChoice(response)?.message.content);
}

export function mapXiaomiUsage(
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

export function xiaomiResponseUsage(
	response: ChatCompletion,
): ResponseUsage | null {
	return mapXiaomiUsage(response.usage);
}

export function xiaomiPatchRequest(
	request: BridgeChatCompletionCreateRequest,
): ChatCompletionRequest {
	assertProviderChatRequest("xiaomi", request);
	const { reasoning_effort: _reasoningEffort, max_tokens, ...rest } = request;
	const providerRequest = {
		...rest,
		...(max_tokens !== undefined ? { max_completion_tokens: max_tokens } : {}),
	} as unknown as ChatCompletionRequest;
	if (hasHistoricalReasoningContent(providerRequest.messages)) {
		return {
			...providerRequest,
			thinking: { type: "enabled" },
		};
	}
	if (providerRequest.thinking === undefined) {
		return {
			...providerRequest,
			thinking: { type: "disabled" },
		};
	}
	return providerRequest;
}

function hasHistoricalReasoningContent(
	messages: ChatCompletionRequest["messages"],
): boolean {
	return messages.some(
		(message) =>
			"reasoning_content" in message &&
			typeof message.reasoning_content === "string" &&
			message.reasoning_content.length > 0,
	);
}

export function xiaomiStreamDeltas(
	chunk: ChatCompletionChunk,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	const usage = mapXiaomiUsage(chunk.usage);
	if (usage) {
		deltas.push({ usage });
	}
	for (const choice of chunk.choices ?? []) {
		deltas.push(...mapXiaomiChoiceDelta(choice.delta ?? {}));
		if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
			deltas.push({ finishReason: choice.finish_reason });
		}
	}
	return deltas;
}

function mapXiaomiChoiceDelta(
	delta: ChatCompletionStreamDelta,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	if (delta.content) {
		deltas.push({ text: delta.content });
	}
	deltas.push(...mapCommonChatStreamDelta(delta));
	return deltas;
}

function extractXiaomiText(content: unknown): string {
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
		`Xiaomi returned invalid ${path}.`,
		{
			provider: "xiaomi",
			model: "unknown",
			upstreamStatus: 502,
			parameter: path,
		},
	);
}
