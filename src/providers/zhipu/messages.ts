import type {
	ResponseCreateRequest,
	ResponseItem,
} from "../../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../../session";
import {
	downgradedResponseToolCallPayload,
	downgradedResponseToolOutputPayload,
	extractResponseText,
	isResponseMessageItem,
	type ResponseMessageItemLike,
	responseFunctionCallPayload,
	responseFunctionOutputPayload,
	type UnsupportedMode,
	unsupportedResponseInputItemError,
} from "../shared/response-message-payloads";
import { toZhipuFunctionName } from "./function-names";
import type { TextMessage, ToolCall } from "./protocol/completions";
import { ZHIPU_PROVIDER_NAME } from "./provider";

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
	const options = payloadOptions(onUnsupported);
	if (isResponseMessageItem(item)) {
		return messageItemToMessage(item, onUnsupported);
	}
	if (item.type === "function_call_output") {
		const payload = responseFunctionOutputPayload(item, options);
		return toolOutputMessage(payload.callId, payload.content);
	}
	if (item.type === "function_call") {
		const payload = responseFunctionCallPayload(item);
		return toolCallMessage(
			payload.callId,
			payload.name,
			payload.argumentsValue,
		);
	}

	const downgradedToolCall = downgradedResponseToolCallPayload(item);
	if (downgradedToolCall) {
		return toolCallMessage(
			downgradedToolCall.callId,
			downgradedToolCall.name,
			downgradedToolCall.argumentsValue,
		);
	}

	const downgradedToolOutput = downgradedResponseToolOutputPayload(
		item,
		options,
	);
	if (downgradedToolOutput)
		return toolOutputMessage(
			downgradedToolOutput.callId,
			downgradedToolOutput.content,
		);

	if (onUnsupported === "throw") {
		throw unsupportedResponseInputItemError(item, options);
	}
	return null;
}

function messageItemToMessage(
	item: ResponseItem & ResponseMessageItemLike,
	onUnsupported: UnsupportedMode,
): TextMessage {
	const content = extractResponseText(
		item.content,
		payloadOptions(onUnsupported),
	);
	if (item.role === "developer") {
		return { role: "system", content };
	}
	return { role: item.role, content };
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

function instructionsToSystemMessage(
	instructions: string | undefined,
): { role: "system"; content: string } | null {
	if (!instructions) return null;
	return { role: "system", content: instructions };
}

function payloadOptions(onUnsupported: UnsupportedMode) {
	return {
		provider: ZHIPU_PROVIDER_NAME,
		providerLabel: "Zhipu",
		onUnsupported,
	};
}
