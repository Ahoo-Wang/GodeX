import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	type ProviderSpec,
} from "../../bridge/provider-spec";
import type { ProviderStreamDelta } from "../../bridge/stream/stream-delta";
import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../../error";
import type {
	ResponseInputTokensDetails,
	ResponseOutputTokensDetails,
	ResponseUsage,
} from "../../protocol/openai/responses";

export interface ExampleChatMessage {
	role: string;
	content: string;
}

export interface ExampleChatRequest {
	model: string;
	messages: ExampleChatMessage[];
	stream?: boolean;
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	response_format?: { type: "text" | "json_object" };
	tools?: ExampleChatTool[];
	tool_choice?:
		| "auto"
		| "none"
		| { type: "function"; function: { name: string } };
}

export interface ExampleChatTool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: unknown;
	};
}

export interface ExampleChatResponse {
	choices: ExampleChatChoice[];
	usage?: ExampleChatUsage;
}

export interface ExampleChatChoice {
	message: {
		role?: string;
		content?: string | null;
	};
	finish_reason?: string | null;
}

export interface ExampleChatChunk {
	choices: ExampleChatChunkChoice[];
	usage?: ExampleChatUsage;
}

export interface ExampleChatChunkChoice {
	delta: {
		content?: string | null;
	};
	finish_reason?: string | null;
}

export interface ExampleChatUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	prompt_tokens_details?: {
		cached_tokens?: number;
	};
	completion_tokens_details?: {
		reasoning_tokens?: number;
	};
}

export const EXAMPLE_PROVIDER_SPEC: ProviderSpec<
	ExampleChatRequest,
	ExampleChatResponse,
	ExampleChatChunk
> = {
	name: "example",
	protocol: CHAT_COMPLETIONS_PROTOCOL,
	capabilities: {
		parameters: {
			supported: new Set([
				"stream",
				"temperature",
				"top_p",
				"max_output_tokens",
				"text.format",
			]),
		},
		tools: {
			supported: new Set(["function"]),
		},
		toolChoice: {
			supported: new Set(["auto", "none", "function"]),
		},
		responseFormats: {
			supported: new Set(["text", "json_object"]),
		},
		reasoning: { effort: "none" },
		streaming: { usage: true },
	},
	endpoint: {
		defaultBaseURL: "https://example.invalid",
	},
	auth: BEARER_AUTH,
	toolName: {
		toProviderName: (name) => name,
		fromProviderName: (name) => name,
	},
	response: {
		firstChoice: (response) => response.choices[0],
		finishReason: (response) => response.choices[0]?.finish_reason ?? undefined,
		outputText: (response) => response.choices[0]?.message.content ?? "",
		usage: (response) => mapUsage(response.usage),
	},
	stream: {
		deltas: (chunk) => mapChunkDeltas(chunk),
	},
};

function mapChunkDeltas(chunk: ExampleChatChunk): ProviderStreamDelta[] {
	const deltas: ProviderStreamDelta[] = [];
	for (const choice of chunk.choices) {
		const delta: ProviderStreamDelta = {
			...(choice.delta.content !== undefined && choice.delta.content !== null
				? { text: choice.delta.content }
				: {}),
			...(choice.finish_reason !== undefined && choice.finish_reason !== null
				? { finishReason: choice.finish_reason }
				: {}),
		};
		if (Object.keys(delta).length > 0) {
			deltas.push(delta);
		}
	}
	const usage = mapUsage(chunk.usage);
	if (usage) {
		deltas.push({ usage });
	}
	return deltas;
}

function mapUsage(usage: ExampleChatUsage | undefined): ResponseUsage | null {
	if (!usage) return null;
	assertFiniteNumber(usage.prompt_tokens, "usage.prompt_tokens");
	assertFiniteNumber(usage.completion_tokens, "usage.completion_tokens");
	assertFiniteNumber(usage.total_tokens, "usage.total_tokens");
	return {
		input_tokens: usage.prompt_tokens,
		output_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens,
		...(usage.prompt_tokens_details
			? { input_tokens_details: mapInputDetails(usage.prompt_tokens_details) }
			: {}),
		...(usage.completion_tokens_details
			? {
					output_tokens_details: mapOutputDetails(
						usage.completion_tokens_details,
					),
				}
			: {}),
	};
}

function mapInputDetails(
	details: NonNullable<ExampleChatUsage["prompt_tokens_details"]>,
): ResponseInputTokensDetails {
	if (details.cached_tokens !== undefined) {
		assertFiniteNumber(
			details.cached_tokens,
			"usage.prompt_tokens_details.cached_tokens",
		);
	}
	return {
		...(details.cached_tokens !== undefined
			? { cached_tokens: details.cached_tokens }
			: {}),
	};
}

function mapOutputDetails(
	details: NonNullable<ExampleChatUsage["completion_tokens_details"]>,
): ResponseOutputTokensDetails {
	if (details.reasoning_tokens !== undefined) {
		assertFiniteNumber(
			details.reasoning_tokens,
			"usage.completion_tokens_details.reasoning_tokens",
		);
	}
	return {
		...(details.reasoning_tokens !== undefined
			? { reasoning_tokens: details.reasoning_tokens }
			: {}),
	};
}

function assertFiniteNumber(
	value: unknown,
	path: string,
): asserts value is number {
	if (typeof value === "number" && Number.isFinite(value)) return;
	throw new ProviderError(
		PROVIDER_UPSTREAM_ERROR,
		`Example provider returned invalid ${path}.`,
		{
			provider: EXAMPLE_PROVIDER_SPEC.name,
			model: "unknown",
			upstreamStatus: 502,
			parameter: path,
		},
	);
}
