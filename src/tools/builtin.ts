import { APPLY_PATCH_TOOL_DEFINITION } from "./apply-patch";
import type {
	BuiltinFunctionToolDefinition,
	BuiltinFunctionToolType,
} from "./definition";
import { LOCAL_SHELL_TOOL_DEFINITION } from "./local-shell";
import { SHELL_TOOL_DEFINITION } from "./shell";

export const BUILTIN_FUNCTION_TOOL_DEFINITIONS = {
	local_shell: LOCAL_SHELL_TOOL_DEFINITION,
	shell: SHELL_TOOL_DEFINITION,
	apply_patch: APPLY_PATCH_TOOL_DEFINITION,
} satisfies Record<BuiltinFunctionToolType, BuiltinFunctionToolDefinition>;
export function isBuiltinFunctionToolType(
	type: string,
): type is BuiltinFunctionToolType {
	return Object.hasOwn(BUILTIN_FUNCTION_TOOL_DEFINITIONS, type);
}

export function getBuiltinFunctionToolDefinition(
	type: string,
): BuiltinFunctionToolDefinition | null {
	return isBuiltinFunctionToolType(type)
		? BUILTIN_FUNCTION_TOOL_DEFINITIONS[type]
		: null;
}
