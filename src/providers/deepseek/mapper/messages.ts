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
import { toDeepSeekFunctionName } from "../function-names";
import type {
	DeepSeekAssistantMessage,
	DeepSeekMessage,
	DeepSeekMessageToolCall,
} from "../protocol/completions";
import { DEEPSEEK_PROVIDER_NAME } from "../provider";

export class DeepSeekMessageMapper
	implements ChatMessageMapper<DeepSeekMessage>
{
	map(ctx: ResponsesContext, _plan: CompatibilityPlan): DeepSeekMessage[] {
		return buildDeepSeekMessages(ctx.request, ctx.session);
	}
}

export function buildDeepSeekMessages(
	req: ResponseCreateRequest,
	session: ResponseSessionSnapshot | null,
): DeepSeekMessage[] {
	const items: ResponseItem[] = [];
	if (session) {
		items.push(...session.input_items);
	}

	if (typeof req.input === "string") {
		items.push({
			type: "message",
			role: "user",
			content: [{ type: "input_text", text: req.input }],
		});
	} else if (Array.isArray(req.input)) {
		for (const item of req.input) {
			items.push(
				typeof item === "string"
					? {
							type: "message",
							role: "user",
							content: [{ type: "input_text", text: item }],
						}
					: (item as ResponseItem),
			);
		}
	}

	const messages: DeepSeekMessage[] = [];
	if (req.instructions) {
		messages.push({ role: "system", content: req.instructions });
	}
	messages.push(...itemsToMessages(items));
	return messages;
}

function itemsToMessages(items: ResponseItem[]): DeepSeekMessage[] {
	const messages: DeepSeekMessage[] = [];
	let pendingReasoning: string | undefined;
	let pendingAssistant: DeepSeekAssistantMessage | null = null;

	const flushAssistant = () => {
		if (!pendingAssistant) return;
		messages.push(pendingAssistant);
		pendingAssistant = null;
		pendingReasoning = undefined;
	};

	for (const item of items) {
		if (item.type === "reasoning") {
			const text = reasoningText(item);
			pendingReasoning = text.length > 0 ? text : undefined;
			continue;
		}

		const message = responseItemToMessage(item);
		if (!message) continue;

		if (message.role === "assistant") {
			if (message.tool_calls && message.tool_calls.length > 0) {
				if (!pendingAssistant) {
					pendingAssistant = { role: "assistant", content: "" };
				}
				pendingAssistant.content = pendingAssistant.content ?? "";
				if (pendingReasoning) {
					pendingAssistant.reasoning_content = pendingReasoning;
				}
				pendingAssistant.tool_calls = [
					...(pendingAssistant.tool_calls ?? []),
					...message.tool_calls,
				];
				continue;
			}

			flushAssistant();
			pendingAssistant = {
				role: "assistant",
				content: message.content ?? "",
			};
			continue;
		}

		flushAssistant();
		messages.push(message);
	}

	flushAssistant();
	return messages;
}

const responseItemToMessage = (
	item: ResponseItem,
	onUnsupported?: UnsupportedMode,
) =>
	convertResponseItemToMessage<DeepSeekMessage>(
		{
			defaultMode: "skip",
			provider: DEEPSEEK_PROVIDER_NAME,
			providerLabel: "DeepSeek",
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
): DeepSeekMessage {
	const content = extractResponseText(
		item.content,
		payloadOptions(onUnsupported),
	);
	if (item.role === "developer") return { role: "system", content };
	return { role: item.role, content } as DeepSeekMessage;
}

function toolCallMessage(
	callId: string,
	name: string,
	argumentsValue: string | Record<string, unknown>,
): DeepSeekMessage {
	return {
		role: "assistant",
		content: "",
		tool_calls: [
			{
				id: callId,
				type: "function",
				function: {
					name: toDeepSeekFunctionName(name),
					arguments:
						typeof argumentsValue === "string"
							? argumentsValue
							: JSON.stringify(argumentsValue),
				},
			} satisfies DeepSeekMessageToolCall,
		],
	};
}

function toolOutputMessage(callId: string, content: string): DeepSeekMessage {
	return { role: "tool", content, tool_call_id: callId };
}

function reasoningText(item: Extract<ResponseItem, { type: "reasoning" }>) {
	const summary = item.summary.map((part) => part.text);
	const content = (item.content ?? []).map((part) => part.text);
	return [...summary, ...content].join("");
}

function payloadOptions(onUnsupported: UnsupportedMode) {
	return {
		provider: DEEPSEEK_PROVIDER_NAME,
		providerLabel: "DeepSeek",
		onUnsupported,
	};
}
