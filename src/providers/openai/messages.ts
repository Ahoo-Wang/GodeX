import { isRecord } from "../../adapter/utils";
import {
	ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
	ADAPTER_REQUEST_UNSUPPORTED_INPUT_ITEM,
	AdapterError,
} from "../../error";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionContentPart,
	ChatCompletionDeveloperMessageParam,
	ChatCompletionMessageParam,
	ChatCompletionSystemMessageParam,
	ChatCompletionToolMessageParam,
	ChatCompletionUserMessageParam,
} from "../../protocol/openai/completions";
import type {
	ResponseCreateRequest,
	ResponseInputContent,
	ResponseItem,
} from "../../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../../session";
import { OPENAI_PROVIDER_NAME } from "./provider";

type UnsupportedMode = "skip" | "throw";

export function buildOpenAIMessages(
	req: ResponseCreateRequest,
	session: ResponseSessionSnapshot | null,
): ChatCompletionMessageParam[] {
	const messages: ChatCompletionMessageParam[] = [];

	const devMsg = instructionsToDeveloperMessage(req.instructions);
	if (devMsg) messages.push(devMsg);

	if (session) {
		for (const item of session.input_items) {
			const msg = responseItemToMessage(item);
			if (msg) messages.push(msg);
		}
	}

	if (typeof req.input === "string") {
		messages.push({ role: "user", content: req.input });
	} else if (Array.isArray(req.input)) {
		for (const item of req.input) {
			if (typeof item === "string") {
				messages.push({ role: "user", content: item });
			} else {
				const msg = responseItemToMessage(item as ResponseItem, "throw");
				if (msg) messages.push(msg);
			}
		}
	}

	return messages;
}

function responseItemToMessage(
	item: ResponseItem,
	onUnsupported: UnsupportedMode = "skip",
): ChatCompletionMessageParam | null {
	if (isMessageItem(item)) {
		return messageItemToMessage(item, onUnsupported);
	}
	if (item.type === "function_call_output") {
		return toolOutputMessage(
			item.call_id,
			functionOutputText(item, onUnsupported),
		);
	}
	if (item.type === "function_call") {
		return toolCallMessage(item.call_id, item.name, item.arguments);
	}

	const downgradedToolCall = downgradedToolCallToMessage(item);
	if (downgradedToolCall) return downgradedToolCall;

	const downgradedToolOutput = downgradedToolOutputToMessage(
		item,
		onUnsupported,
	);
	if (downgradedToolOutput) return downgradedToolOutput;

	if (onUnsupported === "throw") {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_INPUT_ITEM,
			`Unsupported Responses input item type for OpenAI: ${"type" in item ? String(item.type) : "message"}`,
			{ provider: OPENAI_PROVIDER_NAME, model: "unknown" },
		);
	}
	return null;
}

type MessageRole = "user" | "system" | "assistant" | "developer";

interface MessageItemLike {
	role: MessageRole;
	content: unknown;
}

function isMessageItem(
	item: ResponseItem,
): item is ResponseItem & MessageItemLike {
	if (!("role" in item) || !("content" in item)) return false;
	const role = (item as { role: unknown }).role;
	return (
		role === "developer" ||
		role === "system" ||
		role === "assistant" ||
		role === "user"
	);
}

function messageItemToMessage(
	item: ResponseItem & MessageItemLike,
	onUnsupported: UnsupportedMode,
): ChatCompletionMessageParam {
	switch (item.role) {
		case "developer":
			return {
				role: "developer",
				content: extractText(item.content, onUnsupported),
			} satisfies ChatCompletionDeveloperMessageParam;
		case "system":
			return {
				role: "system",
				content: extractText(item.content, onUnsupported),
			} satisfies ChatCompletionSystemMessageParam;
		case "user":
			return {
				role: "user",
				content: extractUserContent(item.content, onUnsupported),
			} satisfies ChatCompletionUserMessageParam;
		case "assistant":
			return buildAssistantMessage(item.content, onUnsupported);
	}
}

function buildAssistantMessage(
	content: unknown,
	onUnsupported: UnsupportedMode,
): ChatCompletionAssistantMessageParam {
	if (typeof content === "string") return { role: "assistant", content };
	if (Array.isArray(content))
		return { role: "assistant", content: extractText(content, onUnsupported) };
	if (content === null || content === undefined) return { role: "assistant" };
	return { role: "assistant", content: extractText(content, onUnsupported) };
}

function extractUserContent(
	content: unknown,
	onUnsupported: UnsupportedMode,
): string | ChatCompletionContentPart[] {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: ChatCompletionContentPart[] = [];
		for (const part of content) {
			if (!isRecord(part)) continue;
			const type = (part as { type?: unknown }).type;
			if (type === "input_text") {
				parts.push({
					type: "text",
					text: String((part as { text: unknown }).text),
				});
			} else if (type === "input_image") {
				const img = part as {
					image_url?: string;
					file_id?: string;
					detail?: string;
				};
				if (!img.image_url) continue;
				parts.push({
					type: "image_url",
					image_url: {
						url: img.image_url,
						...(img.detail
							? { detail: img.detail as "low" | "high" | "auto" }
							: {}),
					},
				});
			} else if (type === "input_audio") {
				parts.push({
					type: "input_audio",
					input_audio: {
						data: String((part as { data: unknown }).data),
						format: (part as { format: unknown }).format as "wav" | "mp3",
					},
				});
			} else if (type === "input_file") {
				const file = part as {
					file_data?: string;
					file_id?: string;
					filename?: string;
				};
				parts.push({
					type: "file",
					file: {
						...(file.file_data ? { file_data: file.file_data } : {}),
						...(file.file_id ? { file_id: file.file_id } : {}),
						...(file.filename ? { filename: file.filename } : {}),
					},
				});
			} else if (type === "output_text") {
				parts.push({
					type: "text",
					text: String((part as { text: unknown }).text),
				});
			} else if (onUnsupported === "throw") {
				throw new AdapterError(
					ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
					`Unsupported Responses input content type for OpenAI: ${String(type)}`,
					{ provider: OPENAI_PROVIDER_NAME, model: "unknown" },
				);
			}
		}
		return parts;
	}
	if (onUnsupported === "throw") {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
			`Unsupported Responses input content type for OpenAI: ${typeof content}`,
			{ provider: OPENAI_PROVIDER_NAME, model: "unknown" },
		);
	}
	return "";
}

function downgradedToolCallToMessage(
	item: ResponseItem,
): ChatCompletionAssistantMessageParam | null {
	switch (item.type) {
		case "local_shell_call":
			return toolCallMessage(item.call_id, "local_shell", {
				command: item.action.command,
				env: item.action.env,
				...(item.action.timeout_ms != null
					? { timeout_ms: item.action.timeout_ms }
					: {}),
				...(item.action.user !== undefined ? { user: item.action.user } : {}),
				...(item.action.working_directory != null
					? { working_directory: item.action.working_directory }
					: {}),
			});
		case "shell_call":
			return toolCallMessage(item.call_id, "shell", {
				commands: item.action.commands,
				...(item.action.timeout_ms != null
					? { timeout_ms: item.action.timeout_ms }
					: {}),
				...(item.action.max_output_length != null
					? { max_output_length: item.action.max_output_length }
					: {}),
			});
		case "apply_patch_call":
			return toolCallMessage(item.call_id, "apply_patch", {
				operation: item.operation,
			});
		case "custom_tool_call":
			return toolCallMessage(item.call_id, item.name, { input: item.input });
		case "tool_search_call":
			return toolCallMessage(
				item.call_id ?? item.id ?? "tool_search",
				"tool_search",
				toolSearchArguments(item.arguments),
			);
		case "mcp_call":
			return toolCallMessage(item.id, item.name, {
				arguments: item.arguments,
				server_label: item.server_label,
				...(item.approval_request_id
					? { approval_request_id: item.approval_request_id }
					: {}),
			});
		default:
			return null;
	}
}

function downgradedToolOutputToMessage(
	item: ResponseItem,
	onUnsupported: UnsupportedMode,
): ChatCompletionToolMessageParam | null {
	switch (item.type) {
		case "local_shell_call_output":
			return toolOutputMessage(item.id, item.output);
		case "shell_call_output":
			return toolOutputMessage(item.call_id, shellOutputText(item.output));
		case "apply_patch_call_output":
			return toolOutputMessage(
				item.call_id,
				`${item.status}: ${item.output ?? ""}`.trim(),
			);
		case "custom_tool_call_output":
			return toolOutputMessage(
				item.call_id,
				toolOutputText(item.output, onUnsupported),
			);
		case "tool_search_output":
			return toolOutputMessage(
				item.call_id ?? item.id ?? "tool_search",
				JSON.stringify(item.tools),
			);
		case "mcp_list_tools":
			return toolOutputMessage(item.id, JSON.stringify(item.tools));
		case "mcp_approval_response":
			return toolOutputMessage(
				item.approval_request_id,
				JSON.stringify({ approve: item.approve, reason: item.reason ?? null }),
			);
		default:
			return null;
	}
}

function toolCallMessage(
	callId: string,
	name: string,
	argumentsValue: string | Record<string, unknown>,
): ChatCompletionAssistantMessageParam {
	return {
		role: "assistant",
		content: "",
		tool_calls: [
			{
				type: "function",
				id: callId,
				function: {
					name,
					arguments:
						typeof argumentsValue === "string"
							? argumentsValue
							: JSON.stringify(argumentsValue),
				},
			},
		],
	};
}

function toolOutputMessage(
	callId: string,
	content: string,
): ChatCompletionToolMessageParam {
	return { role: "tool", content, tool_call_id: callId };
}

function toolSearchArguments(
	argumentsValue: unknown,
): string | Record<string, unknown> {
	if (typeof argumentsValue === "string") return argumentsValue;
	if (isRecord(argumentsValue)) return argumentsValue;
	return { input: argumentsValue };
}

function toolOutputText(
	output: string | ResponseInputContent[],
	onUnsupported: UnsupportedMode,
): string {
	if (typeof output === "string") return output;
	return extractText(output, onUnsupported);
}

function shellOutputText(
	output: Extract<ResponseItem, { type: "shell_call_output" }>["output"],
): string {
	return output
		.map((chunk) => {
			const outcome =
				chunk.outcome.type === "exit"
					? `exit ${chunk.outcome.exit_code}`
					: chunk.outcome.type;
			return `[${outcome}]\nstdout:\n${chunk.stdout}\nstderr:\n${chunk.stderr}`;
		})
		.join("\n");
}

function functionOutputText(
	item: Extract<ResponseItem, { type: "function_call_output" }>,
	onUnsupported: UnsupportedMode,
): string {
	if (typeof item.output === "string") return item.output;
	if (Array.isArray(item.output))
		return extractText(item.output, onUnsupported);
	if (onUnsupported === "throw") {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
			"Unsupported Responses function call output content for OpenAI.",
			{ provider: OPENAI_PROVIDER_NAME, model: "unknown" },
		);
	}
	return "";
}

function extractText(
	content: unknown,
	onUnsupported: UnsupportedMode = "skip",
): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const textParts: string[] = [];
		for (const part of content) {
			if (hasText(part)) {
				textParts.push(part.text);
				continue;
			}
			if (onUnsupported === "throw") {
				throw new AdapterError(
					ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
					`Unsupported Responses input content type for OpenAI: ${contentPartType(part)}`,
					{ provider: OPENAI_PROVIDER_NAME, model: "unknown" },
				);
			}
		}
		return textParts.join("");
	}
	if (onUnsupported === "throw") {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
			`Unsupported Responses input content type for OpenAI: ${typeof content}`,
			{ provider: OPENAI_PROVIDER_NAME, model: "unknown" },
		);
	}
	return "";
}

function hasText(part: unknown): part is { text: string } {
	return isRecord(part) && typeof part.text === "string";
}

function contentPartType(part: unknown): string {
	if (isRecord(part) && "type" in part) return String(part.type);
	return typeof part;
}

function instructionsToDeveloperMessage(
	instructions: string | undefined,
): ChatCompletionDeveloperMessageParam | null {
	if (!instructions) return null;
	return { role: "developer", content: instructions };
}
