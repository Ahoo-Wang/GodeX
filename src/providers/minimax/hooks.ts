import type { ProviderCapabilities } from "../../bridge/compatibility";
import type { ProviderStreamDelta } from "../../bridge/stream/stream-delta";
import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../../error";
import type { ChatCompletionCreateRequest as BridgeChatCompletionCreateRequest } from "../../protocol/openai/completions";
import type { ResponseUsage } from "../../protocol/openai/responses";
import {
	assertProviderChatRequest,
	extractChoiceReasoningContent,
	mapCommonChatStreamDelta,
} from "../shared";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
	ChatCompletionStreamDelta,
	CompletionUsage,
} from "./protocol";

export const MINIMAX_MAX_TOOLS = 128;

export const MINIMAX_SPEC_CAPABILITIES: ProviderCapabilities = {
	parameters: {
		supported: new Set([
			"stream",
			"temperature",
			"top_p",
			"max_output_tokens",
			"user",
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
		maxTools: MINIMAX_MAX_TOOLS,
	},
	toolChoice: { supported: new Set(["auto", "none", "required", "function"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
	},
	reasoning: { effort: "none" },
	streaming: { usage: true },
};

export function minimaxFirstChoice(
	response: ChatCompletion,
): ChatCompletion["choices"][0] | undefined {
	return response.choices?.[0];
}

export function minimaxFinishReason(
	response: ChatCompletion,
): string | undefined {
	return minimaxFirstChoice(response)?.finish_reason;
}

export function minimaxOutputText(response: ChatCompletion): string {
	return extractMiniMaxText(minimaxFirstChoice(response)?.message.content);
}

export function minimaxReasoningText(
	response: ChatCompletion,
): string | undefined {
	const message = minimaxFirstChoice(response)?.message;
	if (!message) return undefined;
	if (Array.isArray(message.reasoning_details)) {
		const text = message.reasoning_details
			.filter((detail) => detail.text.length > 0)
			.map((detail) => detail.text)
			.join("");
		return text.length > 0 ? text : undefined;
	}
	return extractChoiceReasoningContent(minimaxFirstChoice(response));
}

export function mapMiniMaxUsage(
	usage: CompletionUsage | null | undefined,
): ResponseUsage | null {
	if (!usage) return null;
	if (
		usage.prompt_tokens === undefined ||
		usage.completion_tokens === undefined
	) {
		return null;
	}
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

export function minimaxResponseUsage(
	response: ChatCompletion,
): ResponseUsage | null {
	return mapMiniMaxUsage(response.usage);
}

export function minimaxPatchRequest(
	request: BridgeChatCompletionCreateRequest,
): ChatCompletionRequest {
	assertProviderChatRequest("minimax", request);
	const { reasoning_effort: _reasoningEffort, max_tokens, ...rest } = request;
	return {
		...rest,
		reasoning_split: true,
		messages: rest.messages.map(convertReasoningContent),
		...(max_tokens !== undefined ? { max_completion_tokens: max_tokens } : {}),
	} as unknown as ChatCompletionRequest;
}

function convertReasoningContent(message: unknown): unknown {
	if (
		typeof message !== "object" ||
		message === null ||
		!("role" in message) ||
		message.role !== "assistant"
	) {
		return message;
	}
	const assistant = message as Record<string, unknown>;
	const reasoningContent = assistant.reasoning_content;
	if (typeof reasoningContent !== "string" || reasoningContent.length === 0) {
		return message;
	}
	const { reasoning_content: _rc, ...rest } = assistant;
	return {
		...rest,
		reasoning_details: [{ text: reasoningContent }],
	};
}

export function minimaxStreamDeltas(
	chunk: ChatCompletionChunk,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	const usage = mapMiniMaxUsage(chunk.usage);
	if (usage) {
		deltas.push({ usage });
	}
	for (const choice of chunk.choices ?? []) {
		deltas.push(...mapMiniMaxChoiceDelta(choice.delta ?? {}));
		if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
			deltas.push({ finishReason: choice.finish_reason });
		}
	}
	return deltas;
}

function mapMiniMaxChoiceDelta(
	delta: ChatCompletionStreamDelta,
): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	if (delta.reasoning_details) {
		for (const detail of delta.reasoning_details) {
			if (detail.text) {
				deltas.push({ reasoning: detail.text });
			}
		}
	}
	if (delta.content) {
		deltas.push({ text: delta.content });
	}
	deltas.push(...mapCommonChatStreamDelta(delta));
	return deltas;
}

function extractMiniMaxText(content: unknown): string {
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
		`MiniMax returned invalid ${path}.`,
		{
			provider: "minimax",
			model: "unknown",
			upstreamStatus: 502,
			parameter: path,
		},
	);
}
