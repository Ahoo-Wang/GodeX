import { describe, expect, test } from "bun:test";
import { APPLY_PATCH_TOOL_DEFINITION } from "./apply-patch";
import {
	BUILTIN_FUNCTION_TOOL_DEFINITIONS,
	getBuiltinFunctionToolDefinition,
	isBuiltinFunctionToolType,
} from "./builtin";
import { LOCAL_SHELL_TOOL_DEFINITION } from "./local-shell";
import { SHELL_TOOL_DEFINITION } from "./shell";

describe("builtin function definitions", () => {
	test("exposes Codex built-in tool schemas from the adapter layer", () => {
		expect(Object.keys(BUILTIN_FUNCTION_TOOL_DEFINITIONS).sort()).toEqual([
			"apply_patch",
			"local_shell",
			"shell",
		]);

		expect(BUILTIN_FUNCTION_TOOL_DEFINITIONS.local_shell.parameters.type).toBe(
			"object",
		);
		expect(
			BUILTIN_FUNCTION_TOOL_DEFINITIONS.local_shell.parameters.properties
				.command,
		).toMatchObject({
			type: "array",
			items: { type: "string" },
		});
		expect(
			BUILTIN_FUNCTION_TOOL_DEFINITIONS.local_shell.parameters.properties
				.command.description,
		).toContain("argv");
		expect(
			BUILTIN_FUNCTION_TOOL_DEFINITIONS.local_shell.parameters.properties.user
				.description,
		).toContain("user");
		expect(
			BUILTIN_FUNCTION_TOOL_DEFINITIONS.local_shell.parameters.required,
		).toEqual(["command"]);
	});

	test("keeps each built-in tool definition in its own module", () => {
		expect(BUILTIN_FUNCTION_TOOL_DEFINITIONS.local_shell).toBe(
			LOCAL_SHELL_TOOL_DEFINITION,
		);
		expect(BUILTIN_FUNCTION_TOOL_DEFINITIONS.shell).toBe(SHELL_TOOL_DEFINITION);
		expect(BUILTIN_FUNCTION_TOOL_DEFINITIONS.apply_patch).toBe(
			APPLY_PATCH_TOOL_DEFINITION,
		);
	});

	test("looks up built-in function tool definitions by tool type", () => {
		const localShell = getBuiltinFunctionToolDefinition("local_shell");
		expect(localShell?.description).toContain("Use shell");
		expect(localShell?.parameters.properties.command?.description).toContain(
			"no shell parsing",
		);

		const shell = getBuiltinFunctionToolDefinition("shell");
		expect(shell?.name).toBe("shell");
		expect(shell?.description).not.toContain("Downgraded");
		expect(shell?.parameters.properties.commands?.description).toContain(
			"shell exactly as written",
		);

		const applyPatch = getBuiltinFunctionToolDefinition("apply_patch");
		expect(applyPatch?.description).toContain(
			"Prefer this over shell commands",
		);
		expect(applyPatch?.parameters.properties.operation?.description).toContain(
			"create_file",
		);
		expect(applyPatch?.parameters.properties.operation).toMatchObject({
			oneOf: [
				{
					properties: {
						type: { const: "create_file" },
						diff: { description: expect.stringContaining("V4A") },
					},
					required: ["type", "path", "diff"],
				},
				{
					properties: {
						type: { const: "update_file" },
						diff: { description: expect.stringContaining("V4A") },
					},
					required: ["type", "path", "diff"],
				},
				{
					properties: {
						type: { const: "delete_file" },
					},
					required: ["type", "path"],
				},
			],
		});
		expect(getBuiltinFunctionToolDefinition("web_search")).toBeNull();
		expect(isBuiltinFunctionToolType("apply_patch")).toBe(true);
		expect(isBuiltinFunctionToolType("custom")).toBe(false);
	});
});
