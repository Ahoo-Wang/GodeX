import { isRecord } from "../../adapter/utils";
import {
	ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
	ADAPTER_REQUEST_UNSUPPORTED_INPUT_ITEM,
	AdapterError,
} from "../../error";
import type {
	FunctionCall,
	FunctionCallOutput,
	ResponseInputContent,
	ResponseItem,
} from "../../protocol/openai/responses";

export type UnsupportedMode = "skip" | "throw";

export interface ResponseMessagePayloadOptions {
	provider: string;
	onUnsupported: UnsupportedMode;
	model?: string;
	providerLabel?: string;
}

export type ResponseMessageRole = "user" | "system" | "assistant" | "developer";

export interface ResponseMessageItemLike {
	role: ResponseMessageRole;
	content: unknown;
}

export interface ChatToolCallPayload {
	callId: string;
	name: string;
	argumentsValue: string | Record<string, unknown>;
}

export interface ChatToolOutputPayload {
	callId: string;
	content: string;
}

export function isResponseMessageItem(
	item: ResponseItem,
): item is ResponseItem & ResponseMessageItemLike {
	if (!("role" in item) || !("content" in item)) return false;
	const role = (item as { role: unknown }).role;
	return (
		role === "developer" ||
		role === "system" ||
		role === "assistant" ||
		role === "user"
	);
}

export function responseFunctionCallPayload(
	item: FunctionCall,
): ChatToolCallPayload {
	return {
		callId: item.call_id,
		name: item.name,
		argumentsValue: item.arguments,
	};
}

export function responseFunctionOutputPayload(
	item: FunctionCallOutput,
	options: ResponseMessagePayloadOptions,
): ChatToolOutputPayload {
	return {
		callId: item.call_id,
		content: responseFunctionOutputText(item, options),
	};
}

export function downgradedResponseToolCallPayload(
	item: ResponseItem,
): ChatToolCallPayload | null {
	switch (item.type) {
		case "local_shell_call":
			return {
				callId: item.call_id,
				name: "local_shell",
				argumentsValue: {
					command: item.action.command,
					env: item.action.env,
					...(item.action.timeout_ms != null
						? { timeout_ms: item.action.timeout_ms }
						: {}),
					...(item.action.user !== undefined ? { user: item.action.user } : {}),
					...(item.action.working_directory != null
						? { working_directory: item.action.working_directory }
						: {}),
				},
			};
		case "shell_call":
			return {
				callId: item.call_id,
				name: "shell",
				argumentsValue: {
					commands: item.action.commands,
					...(item.action.timeout_ms != null
						? { timeout_ms: item.action.timeout_ms }
						: {}),
					...(item.action.max_output_length != null
						? { max_output_length: item.action.max_output_length }
						: {}),
				},
			};
		case "apply_patch_call":
			return {
				callId: item.call_id,
				name: "apply_patch",
				argumentsValue: { operation: item.operation },
			};
		case "custom_tool_call":
			return {
				callId: item.call_id,
				name: item.name,
				argumentsValue: { input: item.input },
			};
		case "tool_search_call":
			return {
				callId: item.call_id ?? item.id ?? "tool_search",
				name: "tool_search",
				argumentsValue: responseToolSearchArguments(item.arguments),
			};
		case "mcp_call":
			return {
				callId: item.id,
				name: item.name,
				argumentsValue: {
					arguments: item.arguments,
					server_label: item.server_label,
					...(item.approval_request_id
						? { approval_request_id: item.approval_request_id }
						: {}),
				},
			};
		default:
			return null;
	}
}

export function downgradedResponseToolOutputPayload(
	item: ResponseItem,
	options: ResponseMessagePayloadOptions,
): ChatToolOutputPayload | null {
	switch (item.type) {
		case "local_shell_call_output":
			return { callId: item.id, content: item.output };
		case "shell_call_output":
			return {
				callId: item.call_id,
				content: responseShellOutputText(item.output),
			};
		case "apply_patch_call_output":
			return {
				callId: item.call_id,
				content: `${item.status}: ${item.output ?? ""}`.trim(),
			};
		case "custom_tool_call_output":
			return {
				callId: item.call_id,
				content: responseToolOutputText(item.output, options),
			};
		case "tool_search_output":
			return {
				callId: item.call_id ?? item.id ?? "tool_search",
				content: JSON.stringify(item.tools),
			};
		case "mcp_list_tools":
			return { callId: item.id, content: JSON.stringify(item.tools) };
		case "mcp_approval_response":
			return {
				callId: item.approval_request_id,
				content: JSON.stringify({
					approve: item.approve,
					reason: item.reason ?? null,
				}),
			};
		default:
			return null;
	}
}

export function responseToolSearchArguments(
	argumentsValue: unknown,
): string | Record<string, unknown> {
	if (typeof argumentsValue === "string") return argumentsValue;
	if (isRecord(argumentsValue)) return argumentsValue;
	return { input: argumentsValue };
}

export function responseToolOutputText(
	output: string | ResponseInputContent[],
	options: ResponseMessagePayloadOptions,
): string {
	if (typeof output === "string") return output;
	return extractResponseText(output, options);
}

export function responseShellOutputText(
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

export function responseFunctionOutputText(
	item: FunctionCallOutput,
	options: ResponseMessagePayloadOptions,
): string {
	if (typeof item.output === "string") return item.output;
	if (Array.isArray(item.output)) {
		return extractResponseText(item.output, options);
	}
	if (options.onUnsupported === "throw") {
		throw unsupportedResponseInputContentError(
			"Unsupported Responses function call output content",
			options,
		);
	}
	return "";
}

export function extractResponseText(
	content: unknown,
	options: ResponseMessagePayloadOptions,
): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const textParts: string[] = [];
		for (const part of content) {
			if (hasText(part)) {
				textParts.push(part.text);
				continue;
			}
			if (options.onUnsupported === "throw") {
				throw unsupportedResponseInputContentError(
					`Unsupported Responses input content type: ${responseContentPartType(part)}`,
					options,
				);
			}
		}
		return textParts.join("");
	}
	if (options.onUnsupported === "throw") {
		throw unsupportedResponseInputContentError(
			`Unsupported Responses input content type: ${typeof content}`,
			options,
		);
	}
	return "";
}

export function unsupportedResponseInputItemError(
	item: ResponseItem,
	options: ResponseMessagePayloadOptions,
): AdapterError {
	return new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_INPUT_ITEM,
		`Unsupported Responses input item type for ${providerLabel(options)}: ${
			"type" in item && item.type ? String(item.type) : "message"
		}`,
		errorContext(options),
	);
}

export function unsupportedResponseInputContentError(
	message: string,
	options: ResponseMessagePayloadOptions,
): AdapterError {
	return new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
		`${message} for ${providerLabel(options)}.`,
		errorContext(options),
	);
}

export function responseContentPartType(part: unknown): string {
	if (isRecord(part) && "type" in part) return String(part.type);
	return typeof part;
}

function hasText(part: unknown): part is { text: string } {
	return isRecord(part) && typeof part.text === "string";
}

function providerLabel(options: ResponseMessagePayloadOptions): string {
	return options.providerLabel ?? options.provider;
}

function errorContext(options: ResponseMessagePayloadOptions) {
	return {
		provider: options.provider,
		model: options.model ?? "unknown",
	};
}
