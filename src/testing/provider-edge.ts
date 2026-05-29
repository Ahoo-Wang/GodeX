import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	createProviderEdge,
	type ProviderEdge,
	type ProviderRuntimeConfig,
	type ProviderSpec,
} from "../bridge/provider-spec";
import type { ProviderStreamDelta } from "../bridge/stream";
import type { ResponseUsage } from "../protocol/openai/responses";

export interface TestChatResponse {
	choices: Array<{
		message?: { content?: string | null };
		finish_reason?: string | null;
	}>;
	usage?: ResponseUsage | null;
}

export interface CreateTestProviderEdgeOptions {
	readonly name?: string;
	readonly response?: TestChatResponse;
	readonly request?: (body: unknown) => Promise<TestChatResponse>;
	readonly streamEvents?: readonly JsonServerSentEvent<unknown>[];
	readonly stream?: (
		body: unknown,
	) => Promise<ReadableStream<JsonServerSentEvent<unknown>>>;
	readonly streamDeltas?: (chunk: unknown) => ProviderStreamDelta[];
	readonly onRequest?: (body: unknown) => void;
	readonly onStream?: (body: unknown) => void;
}

export function createTestProviderEdge(
	options: CreateTestProviderEdgeOptions = {},
): ProviderEdge<unknown, unknown, unknown> {
	const name = options.name ?? "mock";
	const spec = testProviderSpec(name, options.streamDeltas);
	const response = options.response ?? completedTextResponse();
	return createProviderEdge({
		spec,
		config: testProviderConfig(name),
		request: async (body) => {
			options.onRequest?.(body);
			if (options.request) return options.request(body);
			return response;
		},
		stream: async (body) => {
			options.onStream?.(body);
			if (options.stream) return options.stream(body);
			return new ReadableStream<JsonServerSentEvent<unknown>>({
				start(controller) {
					for (const event of options.streamEvents ?? []) {
						controller.enqueue(event);
					}
					controller.close();
				},
			});
		},
	});
}

export function completedTextResponse(
	text = "",
	usage: ResponseUsage | null = {
		input_tokens: 0,
		output_tokens: 0,
		total_tokens: 0,
	},
): TestChatResponse {
	return {
		choices: [{ message: { content: text }, finish_reason: "stop" }],
		usage,
	};
}

function testProviderSpec(
	name: string,
	streamDeltas?: (chunk: unknown) => ProviderStreamDelta[],
): ProviderSpec<unknown, unknown, unknown> {
	return {
		name,
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
				degraded: new Map(),
				maxTools: 128,
			},
			toolChoice: { supported: new Set(["auto", "none", "function"]) },
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
			toProviderName: (toolName) => toolName,
			fromProviderName: (toolName) => toolName,
		},
		response: {
			firstChoice: (response) => responseChoice(response),
			finishReason: (response) =>
				responseChoice(response)?.finish_reason ?? undefined,
			outputText: (response) =>
				responseChoice(response)?.message?.content ?? "",
			usage: (response) =>
				isTestChatResponse(response) ? (response.usage ?? null) : null,
		},
		stream: {
			deltas: streamDeltas ?? defaultStreamDeltas,
		},
	};
}

function testProviderConfig(name: string): ProviderRuntimeConfig {
	return {
		spec: name,
		credentials: { api_key: "test-key" },
		endpoint: { base_url: "https://example.invalid" },
	};
}

function responseChoice(
	response: unknown,
): TestChatResponse["choices"][0] | undefined {
	return isTestChatResponse(response) ? response.choices[0] : undefined;
}

function isTestChatResponse(response: unknown): response is TestChatResponse {
	return (
		typeof response === "object" &&
		response !== null &&
		"choices" in response &&
		Array.isArray(response.choices)
	);
}

function defaultStreamDeltas(chunk: unknown): ProviderStreamDelta[] {
	if (typeof chunk !== "object" || chunk === null || Array.isArray(chunk)) {
		return [];
	}
	return [chunk as ProviderStreamDelta];
}
