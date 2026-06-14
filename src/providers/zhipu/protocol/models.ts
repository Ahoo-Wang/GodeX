/** 智谱 Chat Completions API 模型标识符 */

/** 文本对话模型 */
export const TEXT_MODELS = [
	"glm-5.2",
	"glm-5.1",
	"glm-5-turbo",
	"glm-5",
	"glm-4.7",
	"glm-4.7-flash",
	"glm-4.7-flashx",
	"glm-4.6",
	"glm-4.5-air",
	"glm-4.5-airx",
	"glm-4.5-flash",
	"glm-4-flash-250414",
	"glm-4-flashx-250414",
] as const;

export type TextModel = (typeof TEXT_MODELS)[number];

/** 视觉理解模型 */
export const VISION_MODELS = [
	"glm-5v-turbo",
	"glm-4.6v",
	"autoglm-phone",
	"glm-4.6v-flash",
	"glm-4.6v-flashx",
	"glm-4v-flash",
	"glm-4.1v-thinking-flashx",
	"glm-4.1v-thinking-flash",
] as const;

export type VisionModel = (typeof VISION_MODELS)[number];

/** 音频语音模型 */
export const AUDIO_MODELS = ["glm-4-voice"] as const;

export type AudioModel = (typeof AUDIO_MODELS)[number];

/** 角色扮演 / 心理咨询模型 */
export const HUMANOID_MODELS = ["charglm-4", "emohaa"] as const;

export type HumanOidModel = (typeof HUMANOID_MODELS)[number];

/** 所有 Chat Completions 模型 */
export const ALL_MODELS = [
	...TEXT_MODELS,
	...VISION_MODELS,
	...AUDIO_MODELS,
	...HUMANOID_MODELS,
] as const;

export type ChatModel = (typeof ALL_MODELS)[number];

/** 支持 thinking 的模型 — 开启后为强制思考 */
export const THINKING_FORCE_MODELS = [
	"glm-5.2",
	"glm-5.1",
	"glm-5",
	"glm-5-turbo",
	"glm-5v-turbo",
	"glm-4.7",
] as const;

export type ThinkingForceModel = (typeof THINKING_FORCE_MODELS)[number];

/** 支持 thinking 的模型 — 开启后由模型自动判断是否思考 */
export const THINKING_AUTO_MODELS = [
	"glm-4.6",
	"glm-4.6v",
	"glm-4.5-air",
	"glm-4.5-airx",
	"glm-4.5-flash",
] as const;

export type ThinkingAutoModel = (typeof THINKING_AUTO_MODELS)[number];

/** 支持 thinking 的全部模型 */
export const THINKING_MODELS = [
	...THINKING_FORCE_MODELS,
	...THINKING_AUTO_MODELS,
	"glm-4.1v-thinking-flashx",
	"glm-4.1v-thinking-flash",
] as const;

export type ThinkingModel = (typeof THINKING_MODELS)[number];

/** 支持 tool_stream 的模型 */
export const TOOL_STREAM_MODELS = [
	"glm-5.2",
	"glm-5.1",
	"glm-5",
	"glm-5-turbo",
	"glm-4.7",
	"glm-4.6",
] as const;

export type ToolStreamModel = (typeof TOOL_STREAM_MODELS)[number];

/** 支持 tools 的视觉模型 */
export const TOOLS_VISION_MODELS = ["glm-4.6v", "autoglm-phone"] as const;

export type ToolsVisionModel = (typeof TOOLS_VISION_MODELS)[number];

/** 智谱推荐模型对照 (OpenAI → 智谱) */
/** OpenAI → 智谱 模型对照 */
export const MODEL_MAPPING = {
	/** GPT-5.4 / GPT-5 → 最新旗舰 */
	"gpt-5.4": "glm-5.1",
	"gpt-5": "glm-5.1",
	/** GPT-5-mini / nano → 快速推理 */
	"gpt-5-mini": "glm-5-turbo",
	"gpt-5-nano": "glm-5-turbo",
	/** GPT-5-codex → 代码生成 */
	"gpt-5-codex": "glm-5.1",
	/** GPT-4o → 通用多模态 (文本) */
	"gpt-4o": "glm-4.7",
	/** GPT-4o-mini → 轻量快速 */
	"gpt-4o-mini": "glm-4.7-flash",
	/** o3 / o4-mini → 深度推理 */
	o3: "glm-5.1",
	"o4-mini": "glm-5.1",
	/** 视觉模型 (GPT-4o 视觉 → 智谱视觉) */
	"gpt-4o-vision": "glm-5v-turbo",
	/** 音频模型 */
	"gpt-4o-audio-preview": "glm-4-voice",
} as const;
