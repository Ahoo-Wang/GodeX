import type {
	ApplyPatchOperation,
	LocalShellCall,
	ResponseItem,
	ShellCall,
} from "../../protocol/openai/responses";
import type { ToolIdentityMap } from "./tool-identity";

export interface ProviderFunctionCall {
	readonly callId: string;
	readonly name: string;
	readonly arguments: string;
}

export function restoreToolCall(
	call: ProviderFunctionCall,
	identities: ToolIdentityMap,
): ResponseItem {
	const identity = identities.get(call.name);
	if (identity?.requestedType === "local_shell") {
		return (
			localShellCall(call) ?? fallbackFunctionCall(call, identity.requestedName)
		);
	}
	if (identity?.requestedType === "shell") {
		return (
			shellCall(call) ?? fallbackFunctionCall(call, identity.requestedName)
		);
	}
	if (identity?.requestedType === "apply_patch") {
		return (
			applyPatchCall(call) ?? fallbackFunctionCall(call, identity.requestedName)
		);
	}
	return fallbackFunctionCall(call, identity?.requestedName ?? call.name);
}

function fallbackFunctionCall(
	call: ProviderFunctionCall,
	name: string,
): ResponseItem {
	return {
		type: "function_call",
		call_id: call.callId,
		name,
		arguments: call.arguments,
	};
}

function localShellCall(call: ProviderFunctionCall): LocalShellCall | null {
	const parsed = parsedRecord(call.arguments);
	if (!parsed) return null;
	const command = parsed.cmd ?? parsed.command;
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
		id: call.callId,
		type: "local_shell_call",
		call_id: call.callId,
		action,
		status: "in_progress",
	};
}

function shellCall(call: ProviderFunctionCall): ShellCall | null {
	const parsed = parsedRecord(call.arguments);
	if (!parsed || !isStringArray(parsed.commands)) return null;

	const action: ShellCall["action"] = { commands: parsed.commands };
	const timeoutMs = optionalNumber(parsed.timeout_ms);
	if (timeoutMs !== undefined) action.timeout_ms = timeoutMs;
	const maxOutputLength = optionalNumber(parsed.max_output_length);
	if (maxOutputLength !== undefined) action.max_output_length = maxOutputLength;

	return {
		type: "shell_call",
		call_id: call.callId,
		action,
		status: "in_progress",
	};
}

function applyPatchCall(call: ProviderFunctionCall): ResponseItem | null {
	const parsed = parsedRecord(call.arguments);
	if (!parsed || !isApplyPatchOperation(parsed.operation)) return null;
	return {
		type: "apply_patch_call",
		call_id: call.callId,
		operation: parsed.operation,
		status: "in_progress",
	};
}

function parsedRecord(value: string): Record<string, unknown> | undefined {
	try {
		const parsed = JSON.parse(value);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
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
	if (typeof value.path !== "string") return false;
	switch (value.type) {
		case "create_file":
		case "update_file":
			return typeof value.diff === "string";
		case "delete_file":
			return true;
		default:
			return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}
