/**
 * 智谱 Chat Completions API 类型定义
 *
 * POST /paas/v4/chat/completions
 * Base URL: https://open.bigmodel.cn/api
 *
 * 支持四种请求子类型：文本、视觉、音频、角色扮演
 */

import type {
	AudioModel,
	HumanOidModel,
	TextModel,
	VisionModel,
} from "./models";

// ============================================================================
// 共享基础类型
// ============================================================================

/** 采样温度 [0.0, 1.0] */
export type Temperature = number;

/** 核采样 top_p [0.01, 1.0] */
export type TopP = number;

/** 最大输出 token 数 */
export type MaxTokens = number;

/** 停止词列表 (最多 4 个，HumanOid 最多 1 个) */
export type StopWords = string[];

/** 请求唯一标识符 (6-64 字符) */
export type RequestId = string;

/** 终端用户唯一标识符 (6-128 字符) */
export type UserId = string;

// ============================================================================
// 思考配置
// ============================================================================

/** 思维链配置 (仅 GLM-4.5 及以上模型支持) */
export interface ChatThinking {
	/**
	 * 是否开启思维链。
	 * - `enabled`: 开启（GLM-5.1/5/5-Turbo/5v-Turbo/4.7 为强制思考，GLM-4.6/4.6V/4.5 为自动判断）
	 * - `disabled`: 关闭
	 * @default "enabled"
	 */
	type: "enabled" | "disabled";
	/**
	 * 是否清除历史对话轮次中的 reasoning_content。
	 * - `true`（默认）：忽略历史 reasoning_content，仅使用非推理内容
	 * - `false`：保留历史 reasoning_content，需完整透传
	 * @default true
	 */
	clear_thinking?: boolean;
}

// ============================================================================
// 消息角色
// ============================================================================

/** 消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

// ============================================================================
// 文本模型消息
// ============================================================================

/** 文本模型 - 系统消息 */
export interface TextSystemMessage {
	role: "system";
	/** 消息文本内容 */
	content: string;
}

/** 文本模型 - 用户消息 */
export interface TextUserMessage {
	role: "user";
	/** 消息文本内容 */
	content: string;
}

/** 文本模型 - 助手消息（可包含工具调用） */
export interface TextAssistantMessage {
	role: "assistant";
	/** 文本消息内容（工具调用时通常为空） */
	content?: string;
	/** 模型生成的工具调用 */
	tool_calls?: ToolCall[];
}

/** 文本模型 - 工具消息 */
export interface TextToolMessage {
	role: "tool";
	/** 消息文本内容 */
	content: string;
	/** 对应的工具调用 ID */
	tool_call_id?: string;
}

/** 文本模型消息联合类型 */
export type TextMessage =
	| TextSystemMessage
	| TextUserMessage
	| TextAssistantMessage
	| TextToolMessage;

// ============================================================================
// 视觉模型多模态内容
// ============================================================================

/** 视觉多模态内容项类型 */
export type VisionContentItemType =
	| "text"
	| "image_url"
	| "video_url"
	| "file_url";

/** 视觉模型 - 多模态文本内容 */
export interface VisionContentText {
	type: "text";
	/** 文本内容 */
	text: string;
}

/** 视觉模型 - 图片 URL 内容 */
export interface VisionContentImageUrl {
	type: "image_url";
	image_url: {
		/**
		 * 图片的 URL 地址或 Base64 编码。
		 * 大小 ≤ 5MB，像素 ≤ 6000×6000，支持 jpg/png/jpeg。
		 * GLM-5V-Turbo/GLM-4.6V/GLM-4.5V 最多 50 张。
		 * GLM-4V-Flash 最多 1 张（不支持 Base64）。
		 */
		url: string;
	};
}

/** 视觉模型 - 视频 URL 内容 */
export interface VisionContentVideoUrl {
	type: "video_url";
	video_url: {
		/**
		 * 视频的 URL 地址。支持 mp4/mkv/mov。
		 * GLM-5V-Turbo/GLM-4.6V/GLM-4.5V: ≤ 200MB。
		 * 注意：GLM-4V-Plus-0111 的 video_url 必须在 content 数组第一位。
		 */
		url: string;
	};
}

/** 视觉模型 - 文件 URL 内容 */
export interface VisionContentFileUrl {
	type: "file_url";
	file_url: {
		/**
		 * 文件的 URL 地址（不支持 Base64）。
		 * 支持 pdf/txt/docx/xlsx/pptx/jsonl 等，最多 50 个。
		 * 注意：不支持同时传入 file_url 和 image_url/video_url。
		 * 仅 GLM-5V-Turbo/GLM-4.6V/GLM-4.5V 支持。
		 */
		url: string;
	};
}

/** 视觉多模态内容项联合类型 */
export type VisionMultimodalContentItem =
	| VisionContentText
	| VisionContentImageUrl
	| VisionContentVideoUrl
	| VisionContentFileUrl;

/** 视觉模型 - 用户消息 content（多模态数组或纯文本） */
export type VisionUserContent = VisionMultimodalContentItem[] | string;

/** 视觉模型 - 用户消息 */
export interface VisionUserMessage {
	role: "user";
	/** 多模态消息内容（多模态数组）或纯文本字符串 */
	content: VisionUserContent;
}

/** 视觉模型 - 系统消息 */
export interface VisionSystemMessage {
	role: "system";
	/** 消息文本内容 */
	content: string;
}

/** 视觉模型 - 助手消息 */
export interface VisionAssistantMessage {
	role: "assistant";
	/** 文本消息内容 */
	content?: string;
}

/** 视觉模型消息联合类型 */
export type VisionMessage =
	| VisionUserMessage
	| VisionSystemMessage
	| VisionAssistantMessage;

// ============================================================================
// 音频模型多模态内容
// ============================================================================

/** 音频多模态内容项类型 */
export type AudioContentItemType = "text" | "input_audio";

/** 音频模型 - 多模态文本内容 */
export interface AudioContentText {
	type: "text";
	/** 文本内容 */
	text: string;
}

/** 音频模型 - 音频输入 */
export interface AudioContentInputAudio {
	type: "input_audio";
	input_audio: {
		/** 语音文件的 base64 编码。音频最长 ≤ 10 分钟。1s 音频 ≈ 12.5 Tokens */
		data: string;
		/** 语音文件格式 */
		format: "wav" | "mp3";
	};
}

/** 音频多模态内容项联合类型 */
export type AudioMultimodalContentItem =
	| AudioContentText
	| AudioContentInputAudio;

/** 音频模型 - 用户消息 content */
export type AudioUserContent = AudioMultimodalContentItem[] | string;

/** 音频模型 - 用户消息 */
export interface AudioUserMessage {
	role: "user";
	content: AudioUserContent;
}

/** 音频模型 - 系统消息 */
export interface AudioSystemMessage {
	role: "system";
	content: string;
}

/** 音频模型 - 助手消息 */
export interface AudioAssistantMessage {
	role: "assistant";
	/** 文本消息内容 */
	content?: string;
	/** 语音消息 */
	audio?: {
		/** 语音消息 ID，用于多轮对话 */
		id: string;
	};
}

/** 音频模型消息联合类型 */
export type AudioMessage =
	| AudioUserMessage
	| AudioSystemMessage
	| AudioAssistantMessage;

// ============================================================================
// 角色扮演模型消息
// ============================================================================

/** 角色扮演模型 - 用户消息 */
export interface HumanOidUserMessage {
	role: "user";
	content: string;
}

/** 角色扮演模型 - 系统消息 */
export interface HumanOidSystemMessage {
	role: "system";
	content: string;
}

/** 角色扮演模型 - 助手消息 */
export interface HumanOidAssistantMessage {
	role: "assistant";
	content?: string;
}

/** 角色扮演模型消息联合类型 */
export type HumanOidMessage =
	| HumanOidUserMessage
	| HumanOidSystemMessage
	| HumanOidAssistantMessage;

// ============================================================================
// 工具调用相关类型
// ============================================================================

/** 工具调用类型 */
export type ToolCallType = "function" | "web_search" | "retrieval" | "mcp";

/** 工具调用 */
export interface ToolCall {
	/** 工具调用 ID */
	id: string;
	/** 工具类型 */
	type: ToolCallType;
	/** 函数调用信息（type 为 "function" 时不为空） */
	function?: {
		/** 函数名称 */
		name: string;
		/** 函数参数，JSON 格式字符串 */
		arguments: string;
	};
}

// ============================================================================
// 工具定义
// ============================================================================

/** 函数参数定义 (JSON Schema 子集) */
export interface FunctionParameters {
	type: "object";
	properties?: Record<string, Record<string, unknown>>;
	required?: string[];
	[key: string]: unknown;
}

/** 函数对象定义 */
export interface FunctionObject {
	/**
	 * 函数名称。只能包含 a-z, A-Z, 0-9, _, -，最大长度 64。
	 * @pattern ^[a-zA-Z0-9_-]+$
	 */
	name: string;
	/** 函数功能描述 */
	description: string;
	/** 函数参数 JSON Schema */
	parameters: FunctionParameters;
}

/** Function Call 工具 */
export interface FunctionTool {
	type: "function";
	function: FunctionObject;
}

/** 知识库检索对象 */
export interface RetrievalObject {
	/** 知识库 ID */
	knowledge_id: string;
	/**
	 * 请求模型的提示模板。支持占位符 {{ knowledge }} 和 {{ question }}。
	 * 默认：在文档 {{ knowledge }} 中搜索问题 {{ question }} 的答案。
	 */
	prompt_template?: string;
}

/** 知识库检索工具 */
export interface RetrievalTool {
	type: "retrieval";
	retrieval: RetrievalObject;
}

/** 搜索引擎类型 */
export type SearchEngine =
	| "search_std"
	| "search_pro"
	| "search_pro_sogou"
	| "search_pro_quark";

/** 搜索时间范围 */
export type SearchRecencyFilter =
	| "oneDay"
	| "oneWeek"
	| "oneMonth"
	| "oneYear"
	| "noLimit";

/** 搜索结果摘要字数 */
export type SearchContentSize = "medium" | "high";

/** 搜索结果返回顺序 */
export type SearchResultSequence = "before" | "after";

/** Web Search 对象 */
export interface WebSearchObject {
	/** 是否启用搜索，默认 false */
	enable?: boolean;
	/** 搜索引擎类型 */
	search_engine: SearchEngine;
	/** 强制触发搜索 */
	search_query?: string;
	/** 是否执行搜索意图识别。true: 识别意图后搜索，false: 跳过识别直接搜索 */
	search_intent?: boolean;
	/** 返回结果条数 1-50，默认 10。search_pro_sogou: 仅 10/20/30/40/50 */
	count?: number;
	/** 搜索结果域名白名单 */
	search_domain_filter?: string;
	/** 搜索时间范围，默认 noLimit */
	search_recency_filter?: SearchRecencyFilter;
	/** 网页摘要字数，默认 medium */
	content_size?: SearchContentSize;
	/** 搜索结果返回顺序，默认 after */
	result_sequence?: SearchResultSequence;
	/** 是否返回搜索来源详细信息，默认 false */
	search_result?: boolean;
	/** 是否强制搜索结果才返回回答，默认 false */
	require_search?: boolean;
	/** 自定义搜索结果处理 Prompt */
	search_prompt?: string;
}

/** Web Search 工具 */
export interface WebSearchTool {
	type: "web_search";
	web_search: WebSearchObject;
}

/** MCP 传输类型 */
export type McpTransportType = "sse" | "streamable-http";

/** MCP 对象 */
export interface MCPObject {
	/**
	 * MCP server 标识。连接智谱 MCP server 时填 MCP code（无需 server_url）。
	 */
	server_label: string;
	/** MCP server 地址 */
	server_url?: string;
	/**
	 * 传输类型
	 * @default "streamable-http"
	 */
	transport_type?: McpTransportType;
	/** 允许的工具集合 */
	allowed_tools?: string[];
	/** MCP server 鉴权 headers */
	headers?: Record<string, string>;
}

/** MCP 工具 */
export interface MCPTool {
	type: "mcp";
	mcp: MCPObject;
}

/** 工具定义联合类型 */
export type ChatTool = FunctionTool | RetrievalTool | WebSearchTool | MCPTool;

/** 工具选择策略 (仅支持 auto) */
export type ToolChoice = "auto";

// ============================================================================
// 响应格式
// ============================================================================

/** 输出格式类型 */
export type ResponseFormatType = "text" | "json_object";

/** 响应格式 */
export interface ResponseFormat {
	/**
	 * 输出格式类型
	 * - `text`: 普通文本输出
	 * - `json_object`: JSON 格式输出（仅文本模型支持）
	 * @default "text"
	 */
	type: ResponseFormatType;
}

// ============================================================================
// Emohaa 角色元数据
// ============================================================================

/** Emohaa 模型角色元数据 */
export interface HumanOidMeta {
	/** 用户信息描述 */
	user_info: string;
	/** 角色信息描述 */
	bot_info: string;
	/** 角色名称 */
	bot_name: string;
	/** 用户名称 */
	user_name: string;
}

// ============================================================================
// Chat Completions 请求参数
// ============================================================================

/** 文本模型请求 */
export interface ChatCompletionTextRequest {
	model: TextModel;
	/** 对话消息列表 (minItems: 1) */
	messages: TextMessage[];
	/** 是否启用流式输出 @default false */
	stream?: boolean;
	stream_options?: {
		include_usage: boolean;
	};
	/** 思维链配置 */
	thinking?: ChatThinking;
	/** 是否启用采样策略 @default true */
	do_sample?: boolean;
	/** 采样温度 [0.0, 1.0] @default 1.0 */
	temperature?: number;
	/** 核采样 top_p [0.01, 1.0] @default 0.95 */
	top_p?: number;
	/** 最大输出 token 数 (最大 131072) */
	max_tokens?: number;
	/**
	 * 是否开启流式工具调用。
	 * 仅 GLM-5.1/5/5-Turbo/4.7/4.6 系列支持。
	 * @default false
	 */
	tool_stream?: boolean;
	/** 工具列表，最多 128 个函数 */
	tools?: ChatTool[];
	/** 工具选择策略，仅支持 auto */
	tool_choice?: ToolChoice;
	/** 停止词列表 (最多 4 个) */
	stop?: string[];
	/** 响应格式（仅文本模型支持） */
	response_format?: ResponseFormat;
	/** 请求唯一标识符 (6-64 字符) */
	request_id?: string;
	/** 终端用户唯一标识符 (6-128 字符) */
	user_id?: string;
}

/** 视觉模型请求 */
export interface ChatCompletionVisionRequest {
	model: VisionModel;
	/** 对话消息列表 (minItems: 1) */
	messages: VisionMessage[];
	/** 是否启用流式输出 @default false */
	stream?: boolean;
	/** 思维链配置 */
	thinking?: ChatThinking;
	/** 是否启用采样策略 @default true */
	do_sample?: boolean;
	/** 采样温度 [0.0, 1.0] @default 0.8 */
	temperature?: number;
	/** 核采样 top_p [0.01, 1.0] @default 0.6 */
	top_p?: number;
	/** 最大输出 token 数 (最大 131072) */
	max_tokens?: number;
	/** 工具列表 (仅 GLM-4.6V / AutoGLM-Phone 支持) */
	tools?: FunctionTool[];
	/** 工具选择策略 (仅 GLM-4.6V 支持) */
	tool_choice?: ToolChoice;
	/** 停止词列表 (最多 4 个) */
	stop?: string[];
	/** 请求唯一标识符 (6-64 字符) */
	request_id?: string;
	/** 终端用户唯一标识符 (6-128 字符) */
	user_id?: string;
}

/** 音频模型请求 */
export interface ChatCompletionAudioRequest {
	model: AudioModel;
	/** 对话消息列表 (minItems: 1) */
	messages: AudioMessage[];
	/** 是否启用流式输出 @default false */
	stream?: boolean;
	/** 是否启用采样策略 @default true */
	do_sample?: boolean;
	/** 采样温度 [0.0, 1.0] @default 0.8 */
	temperature?: number;
	/** 核采样 top_p [0.01, 1.0] @default 0.6 */
	top_p?: number;
	/** 最大输出 token 数 (最大 4096) @default 1024 */
	max_tokens?: number;
	/**
	 * 控制 AI 生成图片时是否添加水印。
	 * - true: 启用显式及隐式数字水印
	 * - false: 关闭所有水印（需签署免责声明）
	 */
	watermark_enabled?: boolean;
	/** 停止词列表 (最多 4 个) */
	stop?: string[];
	/** 请求唯一标识符 (6-64 字符) */
	request_id?: string;
	/** 终端用户唯一标识符 (6-128 字符) */
	user_id?: string;
}

/** 角色扮演模型请求 */
export interface ChatCompletionHumanOidRequest {
	model: HumanOidModel;
	/** 角色及用户信息 (仅限 Emohaa 支持) */
	meta?: HumanOidMeta;
	/** 对话消息列表 (minItems: 1) */
	messages: HumanOidMessage[];
	/** 是否启用流式输出 @default false */
	stream?: boolean;
	/** 是否启用采样策略 @default true */
	do_sample?: boolean;
	/** 采样温度 [0.0, 1.0] @default 0.95 */
	temperature?: number;
	/** 核采样 top_p [0.01, 1.0] @default 0.7 */
	top_p?: number;
	/** 最大输出 token 数 (最大 4096) @default 1024 */
	max_tokens?: number;
	/** 停止词列表 (最多 1 个) */
	stop?: string[];
	/** 请求唯一标识符 (6-64 字符) */
	request_id?: string;
	/** 终端用户唯一标识符 (6-128 字符) */
	user_id?: string;
}

/** Chat Completions 请求联合类型 */
export type ChatCompletionCreateRequest =
	| ChatCompletionTextRequest
	| ChatCompletionVisionRequest
	| ChatCompletionAudioRequest
	| ChatCompletionHumanOidRequest;

// ============================================================================
// 非流式响应
// ============================================================================

/** 推理终止原因 */
export type FinishReason =
	| "stop" // 自然结束或触发停止词
	| "tool_calls" // 命中函数调用
	| "length" // 达到 token 长度限制
	| "sensitive" // 内容被安全审核拦截
	| "network_error" // 模型推理异常
	| "model_context_window_exceeded"; // 超出上下文窗口

/** Token 使用统计 */
export interface CompletionUsage {
	/** 用户输入的 Token 数量 */
	prompt_tokens: number;
	/** 输出的 Token 数量 */
	completion_tokens: number;
	/** 命中的缓存 Token 数量 */
	prompt_tokens_details?: {
		cached_tokens: number;
	};
	/** Token 总数（glm-4-voice: 1 秒音频 = 12.5 Tokens） */
	total_tokens: number;
}

/** 响应消息 - 工具调用 */
export interface ChatCompletionResponseMessageToolCall {
	/** 工具调用 ID */
	id?: string;
	/** 工具类型 */
	type?: "function" | "mcp";
	/** 函数调用信息 */
	function?: {
		/** 函数名称 */
		name: string;
		/** 函数参数 JSON 字符串 */
		arguments: string;
	};
	/** MCP 工具调用信息 */
	mcp?: ChatCompletionResponseMcpResult;
}

/** MCP 工具调用结果 */
export interface ChatCompletionResponseMcpResult {
	/** MCP 工具调用唯一标识 */
	id?: string;
	/** 工具调用类型 */
	type?: "mcp_list_tools" | "mcp_call";
	/** MCP 服务器标签 */
	server_label?: string;
	/** 错误信息 */
	error?: string;
	/** type=mcp_list_tools 时的工具列表 */
	tools?: McpToolDefinition[];
	/** 工具调用参数 (JSON 字符串) */
	arguments?: string;
	/** 工具名称 */
	name?: string;
	/** 工具返回结果 */
	output?: Record<string, unknown>;
}

/** MCP 工具定义 */
export interface McpToolDefinition {
	name: string;
	description: string;
	annotations?: Record<string, unknown>;
	input_schema: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
		additionalProperties?: boolean;
	};
}

/** 响应消息 - 文本回复 */
export interface ChatCompletionTextResponseContent {
	type: "text";
	text: string;
}

/** 响应消息 */
export interface ChatCompletionResponseMessage {
	/** 当前对话角色，默认为 assistant */
	role: "assistant";
	/**
	 * 回复内容：
	 * - 纯文本: string
	 * - 多模态 (GLM-4V 系列): ChatCompletionTextResponseContent[]
	 * - 工具调用时: null
	 */
	content: string | ChatCompletionTextResponseContent[] | null;
	/** 思维链内容（GLM-4.5+ / GLM-4.1v-thinking 系列） */
	reasoning_content?: string;
	/** 音频内容（glm-4-voice 模型） */
	audio?: {
		/** 音频内容 ID，用于多轮对话 */
		id: string;
		/** 音频内容 base64 编码 */
		data: string;
		/** 音频内容过期时间 */
		expires_at: string;
	};
	/** 工具调用列表 */
	tool_calls?: ChatCompletionResponseMessageToolCall[];
}

/** 响应选项 */
export interface ChatCompletionChoice {
	/** 结果索引 */
	index: number;
	/** 响应消息 */
	message: ChatCompletionResponseMessage;
	/** 推理终止原因 */
	finish_reason?: FinishReason;
}

/** 网页搜索结果 */
export interface WebSearchResult {
	/** 来源网站图标 */
	icon?: string;
	/** 搜索结果标题 */
	title?: string;
	/** 搜索结果网页链接 */
	link?: string;
	/** 媒体来源名称 */
	media?: string;
	/** 网站发布时间 */
	publish_date?: string;
	/** 搜索结果网页引用文本 */
	content?: string;
	/** 角标序号 */
	refer?: string;
}

/** 视频生成结果 */
export interface VideoResult {
	/** 视频链接 */
	url?: string;
	/** 视频封面链接 */
	cover_image_url?: string;
}

/** 内容安全过滤 */
export interface ContentFilterResult {
	/**
	 * 安全生效环节：
	 * - `assistant`: 模型推理
	 * - `user`: 用户输入
	 * - `history`: 历史上下文
	 */
	role: "assistant" | "user" | "history";
	/** 严重程度 0-3，0 最严重，3 轻微 */
	level: number;
}

/** Chat Completions 非流式响应 */
export interface ChatCompletionResponse {
	/** 任务 ID */
	id: string;
	/** 请求 ID */
	request_id?: string;
	/** 请求创建时间，Unix 时间戳（秒） */
	created: number;
	/** 模型名称 */
	model: string;
	/** 模型响应列表 */
	choices: ChatCompletionChoice[];
	/** Token 使用统计 */
	usage?: CompletionUsage;
	/** 视频生成结果 */
	video_result?: VideoResult[];
	/** 网页搜索结果（使用 WebSearchTool 时返回） */
	web_search?: WebSearchResult[];
	/** 内容安全信息 */
	content_filter?: ContentFilterResult[];
}

// ============================================================================
// 流式响应 (SSE)
// ============================================================================

/** 流式增量 - 工具调用 */
export interface ChatCompletionStreamDeltaToolCall {
	/** 工具调用索引 */
	index?: number;
	/** 工具调用 ID */
	id?: string;
	/** 工具类型 */
	type?: "function";
	/** 函数调用信息 */
	function?: {
		/** 函数名称 */
		name?: string;
		/** 函数参数（逐步生成） */
		arguments?: string;
	};
}

/** 流式增量 - 音频 */
export interface ChatCompletionStreamDeltaAudio {
	/** 音频内容 ID */
	id?: string;
	/** 音频 base64 */
	data?: string;
	/** 音频过期时间 */
	expires_at?: string;
}

/** 流式增量 */
export interface ChatCompletionStreamDelta {
	/** 当前对话角色，默认 assistant */
	role?: "assistant";
	/**
	 * 增量文本内容。
	 * - 纯文本: string
	 * - 多模态 (GLM-4V 系列): ChatCompletionTextResponseContent[]
	 * - 工具调用时: null
	 */
	content?: string | ChatCompletionTextResponseContent[] | null;
	/** 音频内容 */
	audio?: ChatCompletionStreamDeltaAudio;
	/** 思维链内容 */
	reasoning_content?: string;
	/** 工具调用信息（逐步生成） */
	tool_calls?: ChatCompletionStreamDeltaToolCall[];
}

/** 流式响应选项 */
export interface ChatCompletionStreamChoice {
	/** 结果索引 */
	index: number;
	/** 增量内容 */
	delta: ChatCompletionStreamDelta;
	/** 终止原因 */
	finish_reason?: FinishReason | null;
}

/** 流式内容安全过滤 */
export interface StreamContentFilterResult {
	/** 安全生效环节: assistant / user / history */
	role: "assistant" | "user" | "history";
	/** 严重程度 0-3 */
	level: number;
}

/** Chat Completions 流式 chunk (SSE) */
export interface ChatCompletionChunk {
	/** 任务 ID */
	id: string;
	/** 请求创建时间，Unix 时间戳（秒） */
	created: number;
	/** 模型名称 */
	model: string;
	/** 模型响应列表 */
	choices: ChatCompletionStreamChoice[];
	/** Token 使用统计（仅在 stream_options.include_usage 时返回） */
	usage?: CompletionUsage;
	/** 内容安全信息 */
	content_filter?: StreamContentFilterResult[];
}

// ============================================================================
// 错误响应
// ============================================================================

/** 错误响应 */
export interface ChatCompletionError {
	error: {
		/** 错误码 */
		code: string;
		/** 错误描述 */
		message: string;
	};
}
