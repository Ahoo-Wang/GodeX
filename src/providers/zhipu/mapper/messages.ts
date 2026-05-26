import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type { ChatMessageMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ResponseCreateRequest,
	ResponseItem,
} from "../../../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../../../session";
import {
	convertResponseItemToMessage,
	extractResponseText,
	type ResponseMessageItemLike,
	type UnsupportedMode,
} from "../../shared/response-message-payloads";
import { toZhipuFunctionName } from "../function-names";
import type { TextMessage, ToolCall } from "../protocol/completions";
import { ZHIPU_PROVIDER_NAME } from "../provider";

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
				const msg = responseItemToMessage(item as ResponseItem, "skip");
				if (msg) messages.push(msg);
			}
		}
	}

	return messages;
}

export class ZhipuMessageMapper implements ChatMessageMapper<TextMessage> {
	map(ctx: ResponsesContext, _plan: CompatibilityPlan): TextMessage[] {
		return buildZhipuMessages(ctx.request, ctx.session);
	}
}

const responseItemToMessage = (
	item: ResponseItem,
	onUnsupported?: UnsupportedMode,
) =>
	convertResponseItemToMessage<TextMessage>(
		{
			defaultMode: "skip",
			provider: ZHIPU_PROVIDER_NAME,
			providerLabel: "Zhipu",
			buildToolCallMessage: toolCallMessage,
			buildToolOutputMessage: toolOutputMessage,
			buildMessageItemMessage: messageItemToMessage,
		},
		item,
		onUnsupported,
	);

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
