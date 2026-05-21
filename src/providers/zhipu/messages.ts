// src/providers/zhipu/messages.ts

import { instructionsToSystemMessage, isRecord } from "../../adapter/utils";
import {
	ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
	ADAPTER_REQUEST_UNSUPPORTED_INPUT_ITEM,
	AdapterError,
} from "../../error";
import type {
	ResponseCreateRequest,
	ResponseInputContent,
	ResponseItem,
} from "../../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../../session";
import { toZhipuFunctionName } from "./function-names";
import type { TextMessage, ToolCall } from "./protocol/completions";

type UnsupportedMode = "skip" | "throw";

type ResponseMessageItem = {
	role: "user" | "system" | "assistant" | "developer";
	content: unknown;
};

export function buildZhipuMessages(
	req: ResponseCreateRequest,
	session: ResponseSessionSnapshot | null,
): TextMessage[] {
	const messages: TextMessage[] = [];

	const sysMsg = instructionsToSystemMessage(req.instructions);
	if (sysMsg) messages.push(sysMsg);

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
): TextMessage | null {
	if (isResponseMessageItem(item)) {
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
			`Unsupported Responses input item type for Zhipu: ${"type" in item ? String(item.type) : "message"}`,
			{ provider: "zhipu", model: "unknown" },
		);
	}
	return null;
}

function messageItemToMessage(
	item: ResponseItem & ResponseMessageItem,
	onUnsupported: UnsupportedMode,
): TextMessage {
	const content = extractText(item.content, onUnsupported);
	if (item.role === "developer") {
		return { role: "system", content };
	}
	return { role: item.role, content };
}

function isResponseMessageItem(
	item: ResponseItem,
): item is ResponseItem & ResponseMessageItem {
	if (!("role" in item) || !("content" in item)) {
		return false;
	}
	switch (item.role) {
		case "developer":
		case "assistant":
		case "system":
		case "user":
			return true;
		default:
			return false;
	}
}

function downgradedToolCallToMessage(item: ResponseItem): TextMessage | null {
	switch (item.type) {
		case "local_shell_call":
			return toolCallMessage(item.call_id, "local_shell", {
				command: item.action.command,
				env: item.action.env,
				...(item.action.timeout_ms
					? { timeout_ms: item.action.timeout_ms }
					: {}),
				...(item.action.user !== undefined ? { user: item.action.user } : {}),
				...(item.action.working_directory
					? { working_directory: item.action.working_directory }
					: {}),
			});
		case "shell_call":
			return toolCallMessage(item.call_id, "shell", {
				commands: item.action.commands,
				...(item.action.timeout_ms
					? { timeout_ms: item.action.timeout_ms }
					: {}),
				...(item.action.max_output_length
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
): TextMessage | null {
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
): TextMessage {
	return {
		role: "assistant",
		content: "",
		tool_calls: [
			{
				id: callId,
				type: "function",
				function: {
					name: toZhipuFunctionName(name),
					arguments:
						typeof argumentsValue === "string"
							? argumentsValue
							: JSON.stringify(argumentsValue),
				},
			} satisfies ToolCall,
		],
	};
}

function toolOutputMessage(callId: string, content: string): TextMessage {
	return {
		role: "tool",
		content,
		tool_call_id: callId,
	};
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
	if (Array.isArray(item.output)) {
		return extractText(item.output, onUnsupported);
	}
	if (onUnsupported === "throw") {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
			"Unsupported Responses function call output content for Zhipu.",
			{ provider: "zhipu", model: "unknown" },
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
					`Unsupported Responses input content type for Zhipu: ${contentPartType(part)}`,
					{ provider: "zhipu", model: "unknown" },
				);
			}
		}
		return textParts.join("");
	}
	if (onUnsupported === "throw") {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT,
			`Unsupported Responses input content type for Zhipu: ${typeof content}`,
			{ provider: "zhipu", model: "unknown" },
		);
	}
	return "";
}

function hasText(part: unknown): part is { text: string } {
	return isRecord(part) && typeof part.text === "string";
}

function contentPartType(part: unknown): string {
	if (isRecord(part) && "type" in part) {
		return String(part.type);
	}
	return typeof part;
}
