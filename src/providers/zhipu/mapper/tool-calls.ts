// src/providers/zhipu/mapper/tool-calls.ts

import type {
	ChatToolCallIdentity,
	ChatToolCallIdentityResolver,
	ChatToolCallMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import { isRecord, isStringArray } from "../../../adapter/utils";
import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ApplyPatchOperation,
	CustomToolCall,
	FunctionCall,
	LocalShellCall,
	ResponseItem,
	ResponseTool,
	ShellCall,
	ToolSearchCall,
} from "../../../protocol/openai/responses";
import { findFlattenedNamespaceTool } from "../../shared/tool-name-mapping";
import { toZhipuFunctionName } from "../function-names";

type RequestedTool =
	| { type: "local_shell" }
	| { type: "shell" }
	| { type: "apply_patch" }
	| { type: "tool_search"; execution?: "server" | "client" }
	| { type: "custom"; name: string }
	| { type: "namespace"; namespace: string; name: string };

export class ZhipuToolCallIdentityResolver
	implements ChatToolCallIdentityResolver
{
	resolve(ctx: ResponsesContext, upstreamName: string): ChatToolCallIdentity {
		const match = findFlattenedNamespaceTool(
			ctx.request.tools,
			upstreamName,
			toZhipuFunctionName,
		);
		if (match) {
			return { upstreamName, name: match.name, namespace: match.namespace };
		}
		return { upstreamName, name: upstreamName };
	}
}

export class ZhipuToolCallMapper implements ChatToolCallMapper {
	map(
		ctx: ResponsesContext,
		call: ToolCallSnapshot,
		identity: ChatToolCallIdentity,
	): ResponseItem {
		const name = identity.name;
		const callId = call.id ?? `fc_${name || "tool"}`;
		const args = call.arguments ?? "{}";

		if (identity.namespace) {
			return functionCall(callId, identity.name, args, identity.namespace);
		}

		const requestedTool = findRequestedBuiltInTool(
			ctx.request.tools,
			identity.upstreamName,
		);

		if (!requestedTool) {
			return functionCall(callId, name, args);
		}

		switch (requestedTool.type) {
			case "local_shell":
				return localShellCall(callId, args) ?? functionCall(callId, name, args);
			case "shell":
				return shellCall(callId, args) ?? functionCall(callId, name, args);
			case "apply_patch":
				return applyPatchCall(callId, args) ?? functionCall(callId, name, args);
			case "tool_search":
				return toolSearchCall(callId, args, requestedTool.execution);
			case "custom":
				return customToolCall(callId, args, requestedTool.name);
			case "namespace":
				return functionCall(
					callId,
					requestedTool.name,
					args,
					requestedTool.namespace,
				);
		}
	}
}

/**
 * Convenience wrapper matching the old signature for non-stream (response) usage.
 */
export function mapZhipuToolCall(
	ctx: ResponsesContext,
	toolCall: ToolCallSnapshot,
): ResponseItem {
	const name = toolCall.name ?? "";
	const callId = toolCall.id ?? `fc_${name || "tool"}`;
	const args = toolCall.arguments ?? "{}";

	// For response (non-stream) mapping, do full lookup including namespace
	const requestedTool = findRequestedTool(ctx.request.tools, name);

	if (!requestedTool) {
		return functionCall(callId, name, args);
	}

	switch (requestedTool.type) {
		case "local_shell":
			return localShellCall(callId, args) ?? functionCall(callId, name, args);
		case "shell":
			return shellCall(callId, args) ?? functionCall(callId, name, args);
		case "apply_patch":
			return applyPatchCall(callId, args) ?? functionCall(callId, name, args);
		case "tool_search":
			return toolSearchCall(callId, args, requestedTool.execution);
		case "custom":
			return customToolCall(callId, args, requestedTool.name);
		case "namespace":
			return functionCall(
				callId,
				requestedTool.name,
				args,
				requestedTool.namespace,
			);
	}
}

function findRequestedBuiltInTool(
	tools: ResponseTool[] | undefined,
	providerName: string,
): RequestedTool | null {
	if (!tools) return null;

	for (const tool of tools) {
		switch (tool.type) {
			case "local_shell":
			case "shell":
			case "apply_patch":
				if (providerName === toZhipuFunctionName(tool.type)) {
					return { type: tool.type };
				}
				break;
			case "tool_search":
				if (providerName === toZhipuFunctionName(tool.type)) {
					return { type: "tool_search", execution: tool.execution };
				}
				break;
			case "custom":
				if (providerName === toZhipuFunctionName(tool.name)) {
					return { type: "custom", name: tool.name };
				}
				break;
		}
	}

	return null;
}

/**
 * Original findRequestedTool for non-stream (response) usage.
 * Checks both namespace and non-namespace tools.
 */
function findRequestedTool(
	tools: ResponseTool[] | undefined,
	providerName: string,
): RequestedTool | null {
	if (!tools) return null;
	const namespaceMatch = findFlattenedNamespaceTool(
		tools,
		providerName,
		toZhipuFunctionName,
	);
	if (namespaceMatch) {
		return {
			type: "namespace",
			namespace: namespaceMatch.namespace,
			name: namespaceMatch.name,
		};
	}

	return findRequestedBuiltInTool(tools, providerName);
}

function functionCall(
	callId: string,
	name: string,
	args: string,
	namespace?: string,
): FunctionCall {
	return {
		type: "function_call",
		call_id: callId,
		...(namespace ? { namespace } : {}),
		name,
		arguments: args,
	};
}

function localShellCall(callId: string, args: string): LocalShellCall | null {
	const parsed = parsedRecord(args);
	if (!parsed) return null;

	const command = parsed.command;
	if (!isStringArray(command)) return null;

	const action: LocalShellCall["action"] = {
		type: "exec",
		command,
		env: stringRecord(parsed.env),
	};
	const timeoutMs = optionalNumber(parsed.timeout_ms);
	if (timeoutMs !== undefined) action.timeout_ms = timeoutMs;
	const user = optionalString(parsed.user);
	if (user !== undefined) action.user = user;
	const workingDirectory = optionalString(parsed.working_directory);
	if (workingDirectory !== undefined)
		action.working_directory = workingDirectory;

	return {
		id: callId,
		type: "local_shell_call",
		call_id: callId,
		action,
		status: "in_progress",
	};
}

function shellCall(callId: string, args: string): ShellCall | null {
	const parsed = parsedRecord(args);
	if (!parsed) return null;
	const commands = parsed.commands;
	if (!isStringArray(commands)) return null;

	const action: ShellCall["action"] = { commands };
	const timeoutMs = optionalNumber(parsed.timeout_ms);
	if (timeoutMs !== undefined) action.timeout_ms = timeoutMs;
	const maxOutputLength = optionalNumber(parsed.max_output_length);
	if (maxOutputLength !== undefined) action.max_output_length = maxOutputLength;

	return {
		type: "shell_call",
		call_id: callId,
		action,
		status: "in_progress",
	};
}

function applyPatchCall(callId: string, args: string): ResponseItem | null {
	const parsed = parsedRecord(args);
	if (!parsed || !isApplyPatchOperation(parsed.operation)) return null;

	return {
		type: "apply_patch_call",
		call_id: callId,
		operation: parsed.operation,
		status: "in_progress",
	};
}

function toolSearchCall(
	callId: string,
	args: string,
	execution: "server" | "client" | undefined,
): ToolSearchCall {
	return {
		type: "tool_search_call",
		call_id: callId,
		arguments: parseJson(args) ?? args,
		execution: execution ?? "server",
		status: "in_progress",
	};
}

function customToolCall(
	callId: string,
	args: string,
	name: string,
): CustomToolCall {
	const parsed = parseJson(args);
	return {
		type: "custom_tool_call",
		call_id: callId,
		name,
		input: customToolInput(parsed, args),
	};
}

function customToolInput(parsed: unknown, fallback: string): string {
	if (isRecord(parsed) && "input" in parsed) {
		const input = parsed.input;
		if (typeof input === "string") return input;
		return JSON.stringify(input);
	}
	if (typeof parsed === "string") return parsed;
	return fallback;
}

function parsedRecord(value: string): Record<string, unknown> | null {
	const parsed = parseJson(value);
	return isRecord(parsed) ? parsed : null;
}

function parseJson(value: string): unknown | null {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function stringRecord(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};

	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string") result[key] = item;
	}
	return result;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function isApplyPatchOperation(value: unknown): value is ApplyPatchOperation {
	if (!isRecord(value) || typeof value.type !== "string") return false;

	switch (value.type) {
		case "create_file":
		case "update_file":
			return typeof value.path === "string" && typeof value.diff === "string";
		case "delete_file":
			return typeof value.path === "string";
		default:
			return false;
	}
}
