import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type { ChatMessageMapper } from "../../../adapter/mapper/chat/contract";
import { isRecord } from "../../../adapter/utils";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionContentPart,
	ChatCompletionDeveloperMessageParam,
	ChatCompletionMessageParam,
	ChatCompletionSystemMessageParam,
	ChatCompletionToolMessageParam,
	ChatCompletionUserMessageParam,
} from "../../../protocol/openai/completions";
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
	unsupportedResponseInputContentError,
} from "../../shared/response-message-payloads";
import { OPENAI_PROVIDER_NAME } from "../provider";

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

export class OpenAIMessageMapper
	implements ChatMessageMapper<ChatCompletionMessageParam>
{
	map(
		ctx: ResponsesContext,
		_plan: CompatibilityPlan,
	): ChatCompletionMessageParam[] {
		return buildOpenAIMessages(ctx.request, ctx.session);
	}
}

const responseItemToMessage = (
	item: ResponseItem,
	onUnsupported?: UnsupportedMode,
) =>
	convertResponseItemToMessage<ChatCompletionMessageParam>(
		{
			defaultMode: "skip",
			provider: OPENAI_PROVIDER_NAME,
			providerLabel: "OpenAI",
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
): ChatCompletionMessageParam {
	const options = payloadOptions(onUnsupported);
	switch (item.role) {
		case "developer":
			return {
				role: "developer",
				content: extractResponseText(item.content, options),
			} satisfies ChatCompletionDeveloperMessageParam;
		case "system":
			return {
				role: "system",
				content: extractResponseText(item.content, options),
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
	const options = payloadOptions(onUnsupported);
	if (typeof content === "string") return { role: "assistant", content };
	if (Array.isArray(content))
		return {
			role: "assistant",
			content: extractResponseText(content, options),
		};
	if (content === null || content === undefined) return { role: "assistant" };
	return { role: "assistant", content: extractResponseText(content, options) };
}

function extractUserContent(
	content: unknown,
	onUnsupported: UnsupportedMode,
): string | ChatCompletionContentPart[] {
	const options = payloadOptions(onUnsupported);
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
				throw unsupportedResponseInputContentError(
					`Unsupported Responses input content type: ${String(type)}`,
					options,
				);
			}
		}
		return parts;
	}
	if (onUnsupported === "throw") {
		throw unsupportedResponseInputContentError(
			`Unsupported Responses input content type: ${typeof content}`,
			options,
		);
	}
	return "";
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

function instructionsToDeveloperMessage(
	instructions: string | undefined,
): ChatCompletionDeveloperMessageParam | null {
	if (!instructions) return null;
	return { role: "developer", content: instructions };
}

function payloadOptions(onUnsupported: UnsupportedMode) {
	return {
		provider: OPENAI_PROVIDER_NAME,
		providerLabel: "OpenAI",
		onUnsupported,
	};
}
