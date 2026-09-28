// ============================================================
// OpenAI Model Identifiers
// ============================================================

/** All model IDs supported by Chat Completions API. */
export const CHAT_COMPLETIONS_MODELS = [
	// GPT-5.4
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.4-nano",
	"gpt-5.4-mini-2026-03-17",
	"gpt-5.4-nano-2026-03-17",
	// GPT-5.3
	"gpt-5.3-chat-latest",
	// GPT-5.2
	"gpt-5.2",
	"gpt-5.2-2025-12-11",
	"gpt-5.2-chat-latest",
	"gpt-5.2-pro",
	"gpt-5.2-pro-2025-12-11",
	// GPT-5.1
	"gpt-5.1",
	"gpt-5.1-2025-11-13",
	"gpt-5.1-codex",
	"gpt-5.1-mini",
	"gpt-5.1-chat-latest",
	// GPT-5
	"gpt-5",
	"gpt-5-mini",
	"gpt-5-nano",
	"gpt-5-2025-08-07",
	"gpt-5-mini-2025-08-07",
	"gpt-5-nano-2025-08-07",
	"gpt-5-chat-latest",
	// GPT-4.1
	"gpt-4.1",
	"gpt-4.1-mini",
	"gpt-4.1-nano",
	"gpt-4.1-2025-04-14",
	"gpt-4.1-mini-2025-04-14",
	"gpt-4.1-nano-2025-04-14",
	// o4
	"o4-mini",
	"o4-mini-2025-04-16",
	// o3
	"o3",
	"o3-2025-04-16",
	"o3-mini",
	"o3-mini-2025-01-31",
	// o1
	"o1",
	"o1-2024-12-17",
	"o1-preview",
	"o1-preview-2024-09-12",
	"o1-mini",
	"o1-mini-2024-09-12",
	// GPT-4o
	"gpt-4o",
	"gpt-4o-2024-11-20",
	"gpt-4o-2024-08-06",
	"gpt-4o-2024-05-13",
	"gpt-4o-audio-preview",
	"gpt-4o-audio-preview-2024-10-01",
	"gpt-4o-audio-preview-2024-12-17",
	"gpt-4o-audio-preview-2025-06-03",
	"gpt-4o-mini-audio-preview",
	"gpt-4o-mini-audio-preview-2024-12-17",
	"gpt-4o-search-preview",
	"gpt-4o-mini-search-preview",
	"gpt-4o-search-preview-2025-03-11",
	"gpt-4o-mini-search-preview-2025-03-11",
	"chatgpt-4o-latest",
	"codex-mini-latest",
	"gpt-4o-mini",
	"gpt-4o-mini-2024-07-18",
	// GPT-4
	"gpt-4-turbo",
	"gpt-4-turbo-2024-04-09",
	"gpt-4-0125-preview",
	"gpt-4-turbo-preview",
	"gpt-4-1106-preview",
	"gpt-4-vision-preview",
	"gpt-4",
	"gpt-4-0314",
	"gpt-4-0613",
	"gpt-4-32k",
	"gpt-4-32k-0314",
	"gpt-4-32k-0613",
	// GPT-3.5
	"gpt-3.5-turbo",
	"gpt-3.5-turbo-16k",
	"gpt-3.5-turbo-0301",
	"gpt-3.5-turbo-0613",
	"gpt-3.5-turbo-1106",
	"gpt-3.5-turbo-0125",
	"gpt-3.5-turbo-16k-0613",
] as const;

/** Models only available in Responses API (not Chat Completions). */
export const RESPONSES_ONLY_MODELS = [
	"o1-pro",
	"o1-pro-2025-03-19",
	"o3-pro",
	"o3-pro-2025-06-10",
	"o3-deep-research",
	"o3-deep-research-2025-06-26",
	"o4-mini-deep-research",
	"o4-mini-deep-research-2025-06-26",
	"computer-use-preview",
	"computer-use-preview-2025-03-11",
	"gpt-5-codex",
	"gpt-5-pro",
	"gpt-5-pro-2025-10-06",
	"gpt-5.1-codex-max",
] as const;

/** All model IDs supported by Responses API. */
export const RESPONSES_MODELS = [
	...CHAT_COMPLETIONS_MODELS,
	...RESPONSES_ONLY_MODELS,
] as const;

/** Image generation models. */
export const IMAGE_GENERATION_MODELS = [
	"gpt-image-1",
	"gpt-image-1-mini",
	"gpt-image-1.5",
	"gpt-image-2",
	"gpt-image-2-2026-04-21",
] as const;

// ============================================================
// Model Type Aliases
// ============================================================

export type ChatCompletionsModel = (typeof CHAT_COMPLETIONS_MODELS)[number];
export type ResponsesOnlyModel = (typeof RESPONSES_ONLY_MODELS)[number];
export type ResponsesModel = (typeof RESPONSES_MODELS)[number];
export type ImageGenerationModel = (typeof IMAGE_GENERATION_MODELS)[number];

/** Any model string (for future models). */
export type AnyModel =
	| ChatCompletionsModel
	| ResponsesOnlyModel
	| (string & {});
