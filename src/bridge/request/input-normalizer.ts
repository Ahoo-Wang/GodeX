import {
	BRIDGE_REQUEST_UNSUPPORTED_INPUT_CONTENT,
	BRIDGE_REQUEST_UNSUPPORTED_INPUT_ITEM,
	BridgeError,
} from "../../error";
import type { ChatCompletionMessageParam } from "../../protocol/openai/completions";
import type {
	ResponseCreateRequest,
	ResponseItem,
} from "../../protocol/openai/responses";
import type { ToolPlan } from "../tools";

export type NormalizedChatMessage = ChatCompletionMessageParam;

export interface InputNormalizerContext {
	readonly provider?: string;
	readonly model?: string;
	readonly toolPlan?: ToolPlan;
}

export function normalizeCurrentInput(
	request: ResponseCreateRequest,
	context: InputNormalizerContext = {},
): NormalizedChatMessage[] {
	const messages: NormalizedChatMessage[] = [];
	if (request.instructions) {
		messages.push({ role: "system", content: request.instructions });
	}

	if (request.input === undefined) return messages;
	if (typeof request.input === "string") {
		messages.push({ role: "user", content: request.input });
		return messages;
	}

	messages.push(...normalizeInputItems(request.input, request, context));
	return messages;
}

export function normalizeResponseItems(
	items: readonly ResponseItem[],
	request: ResponseCreateRequest,
	context: InputNormalizerContext = {},
): NormalizedChatMessage[] {
	return normalizeInputItems(items, request, context);
}

function normalizeInputItems(
	items: readonly ResponseItem[],
	request: ResponseCreateRequest,
	context: InputNormalizerContext,
): NormalizedChatMessage[] {
	const messages: NormalizedChatMessage[] = [];
	let pendingReasoning: string | undefined;
	for (const item of items) {
		if (item.type === "reasoning") {
			pendingReasoning = appendReasoningText(
				pendingReasoning,
				reasoningText(item),
			);
			continue;
		}
		const itemMessages = normalizeInputItem(item, request, context);
		if (pendingReasoning && itemMessages[0]?.role === "assistant") {
			itemMessages[0] = {
				...itemMessages[0],
				reasoning_content: pendingReasoning,
			};
			pendingReasoning = undefined;
		}
		messages.push(...itemMessages);
	}
	return messages;
}

function appendReasoningText(
	current: string | undefined,
	next: string,
): string | undefined {
	if (!next) return current;
	return current ? `${current}\n${next}` : next;
}

function normalizeInputItem(
	item: ResponseItem,
	request: ResponseCreateRequest,
	context: InputNormalizerContext,
): NormalizedChatMessage[] {
	if (isSimpleMessageItem(item)) {
		const role = item.role === "developer" ? "system" : item.role;
		return [
			{
				role,
				content: normalizeMessageContent(item.content, request, context),
			} as NormalizedChatMessage,
		];
	}
	if (item.type === "function_call") {
		return [
			assistantToolCallMessage(
				item.call_id,
				providerToolName(context, "function", toolName(item)),
				item.arguments,
			),
		];
	}
	if (item.type === "function_call_output") {
		return [
			toolOutputMessage(
				item.call_id,
				outputText(item.output, request, context),
			),
		];
	}
	if (item.type === "shell_call") {
		return [
			assistantToolCallMessage(
				item.call_id,
				providerToolName(context, "shell", "shell"),
				JSON.stringify(item.action),
			),
		];
	}
	if (item.type === "shell_call_output") {
		return [
			toolOutputMessage(
				item.call_id,
				item.output
					.map((chunk) => {
						const outcome =
							chunk.outcome.type === "exit"
								? `exit ${chunk.outcome.exit_code}`
								: chunk.outcome.type;
						return `[${outcome}]\nstdout:\n${chunk.stdout}\nstderr:\n${chunk.stderr}`;
					})
					.join("\n"),
			),
		];
	}
	if (item.type === "local_shell_call") {
		return [
			assistantToolCallMessage(
				item.call_id,
				providerToolName(context, "local_shell", "local_shell"),
				JSON.stringify({
					command: item.action.command,
					env: item.action.env,
					...(item.action.timeout_ms !== undefined
						? { timeout_ms: item.action.timeout_ms }
						: {}),
					...(item.action.user !== undefined ? { user: item.action.user } : {}),
					...(item.action.working_directory !== undefined
						? { working_directory: item.action.working_directory }
						: {}),
				}),
			),
		];
	}
	if (item.type === "local_shell_call_output") {
		return [toolOutputMessage(item.call_id, item.output)];
	}
	if (item.type === "apply_patch_call") {
		return [
			assistantToolCallMessage(
				item.call_id,
				providerToolName(context, "apply_patch", "apply_patch"),
				JSON.stringify({ operation: item.operation }),
			),
		];
	}
	if (item.type === "apply_patch_call_output") {
		return [
			toolOutputMessage(
				item.call_id,
				`${item.status}: ${item.output ?? ""}`.trim(),
			),
		];
	}
	if (item.type === "custom_tool_call") {
		return [
			assistantToolCallMessage(
				item.call_id,
				providerToolName(context, "custom", toolName(item)),
				JSON.stringify({ input: item.input }),
			),
		];
	}
	if (item.type === "custom_tool_call_output") {
		return [
			toolOutputMessage(
				item.call_id,
				outputText(item.output, request, context),
			),
		];
	}

	throw unsupportedInputItemError(item, request, context);
}

function assistantToolCallMessage(
	callId: string,
	name: string,
	argumentsValue: string,
): NormalizedChatMessage {
	return {
		role: "assistant",
		content: "",
		tool_calls: [
			{
				id: callId,
				type: "function",
				function: { name, arguments: argumentsValue },
			},
		],
	};
}

function toolOutputMessage(
	callId: string,
	content: string,
): NormalizedChatMessage {
	return { role: "tool", tool_call_id: callId, content };
}

function normalizeMessageContent(
	content: unknown,
	request: ResponseCreateRequest,
	context: InputNormalizerContext,
): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) {
		throw unsupportedInputContentError(
			`Unsupported Responses input content type: ${typeof content}`,
			request,
			context,
		);
	}

	const textParts: string[] = [];
	for (const part of content) {
		if (isTextPart(part)) {
			textParts.push(part.text);
			continue;
		}
		throw unsupportedInputContentError(
			`Unsupported Responses input content type: ${contentPartType(part)}`,
			request,
			context,
		);
	}
	return textParts.join("");
}

function isSimpleMessageItem(item: ResponseItem): item is ResponseItem & {
	readonly role: "system" | "user" | "assistant" | "developer";
	readonly content: unknown;
} {
	if (!isRecord(item) || !("role" in item) || !("content" in item)) {
		return false;
	}
	return (
		item.role === "system" ||
		item.role === "user" ||
		item.role === "assistant" ||
		item.role === "developer"
	);
}

function isTextPart(
	part: unknown,
): part is { readonly type: string; readonly text: string } {
	return (
		isRecord(part) &&
		(part.type === "input_text" || part.type === "output_text") &&
		typeof part.text === "string"
	);
}

function outputText(
	output: string | readonly unknown[],
	request: ResponseCreateRequest,
	context: InputNormalizerContext,
): string {
	if (typeof output === "string") return output;
	return normalizeMessageContent(output, request, context);
}

function toolName(item: { name: string; namespace?: string }): string {
	return item.namespace ? `${item.namespace}__${item.name}` : item.name;
}

function providerToolName(
	context: InputNormalizerContext,
	requestedType: string,
	requestedName: string,
): string {
	const declaration = context.toolPlan?.declarations.find(
		(candidate) =>
			candidate.requestedType === requestedType &&
			candidate.requestedName === requestedName,
	);
	return declaration?.providerName ?? requestedName;
}

function reasoningText(
	item: Extract<ResponseItem, { type: "reasoning" }>,
): string {
	return (item.content ?? []).map((part) => part.text).join("");
}

function unsupportedInputItemError(
	item: ResponseItem,
	request: ResponseCreateRequest,
	context: InputNormalizerContext,
): BridgeError {
	return new BridgeError(
		BRIDGE_REQUEST_UNSUPPORTED_INPUT_ITEM,
		`Unsupported Responses input item type for ${provider(context)}: ${inputItemType(item)}.`,
		errorContext(request, context, "input"),
	);
}

function unsupportedInputContentError(
	message: string,
	request: ResponseCreateRequest,
	context: InputNormalizerContext,
): BridgeError {
	return new BridgeError(
		BRIDGE_REQUEST_UNSUPPORTED_INPUT_CONTENT,
		`${message} for ${provider(context)}.`,
		errorContext(request, context, "input.content"),
	);
}

function inputItemType(item: ResponseItem): string {
	if (isRecord(item) && "type" in item && item.type) return String(item.type);
	return "message";
}

function contentPartType(part: unknown): string {
	if (isRecord(part) && "type" in part) return String(part.type);
	return typeof part;
}

function errorContext(
	request: ResponseCreateRequest,
	context: InputNormalizerContext,
	parameter: string,
): { provider: string; model: string; parameter: string } {
	return {
		provider: provider(context),
		model: context.model ?? requestModel(request),
		parameter,
	};
}

function provider(context: InputNormalizerContext): string {
	return context.provider ?? "bridge";
}

function requestModel(request: ResponseCreateRequest): string {
	return typeof request.model === "string" ? request.model : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
