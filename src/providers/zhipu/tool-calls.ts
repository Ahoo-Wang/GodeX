// src/providers/zhipu/tool-calls.ts

import { isRecord } from "../../adapter/utils";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ApplyPatchOperation,
	CustomToolCall,
	FunctionCall,
	LocalShellCall,
	ResponseItem,
	ResponseTool,
	ShellCall,
	ToolSearchCall,
} from "../../protocol/openai/responses";
import { findFlattenedNamespaceTool } from "../shared/tool-name-mapping";
import { toZhipuFunctionName } from "./function-names";

export interface ZhipuFunctionToolCall {
	id?: string;
	name?: string;
	arguments?: string;
}

type RequestedTool =
	| { type: "local_shell" }
	| { type: "shell" }
	| { type: "apply_patch" }
	| { type: "tool_search"; execution?: "server" | "client" }
	| { type: "custom"; name: string }
	| { type: "namespace"; namespace: string; name: string };

export function mapZhipuToolCall(
	ctx: ResponsesContext,
	toolCall: ZhipuFunctionToolCall,
): ResponseItem {
	const name = toolCall.name ?? "";
	const callId = toolCall.id ?? `fc_${name || "tool"}`;
	const args = toolCall.arguments ?? "{}";
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

	const command = stringArray(parsed.command);
	if (!command) return null;

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

	const commands = stringArray(parsed.commands);
	if (!commands) return null;

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

function stringArray(value: unknown): string[] | null {
	return Array.isArray(value) && value.every((item) => typeof item === "string")
		? value
		: null;
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
