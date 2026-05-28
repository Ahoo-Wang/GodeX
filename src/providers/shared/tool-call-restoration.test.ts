import { describe, expect, test } from "bun:test";
import type { ResponseTool } from "../../protocol/openai/responses";
import {
	createFunctionCall,
	restoreToolCallFromFunctionName,
} from "./tool-call-restoration";

const encodeName = (name: string) => name.replaceAll(".", "_");

const tools: ResponseTool[] = [
	{
		type: "function",
		name: "weather.now",
		parameters: { type: "object" },
		strict: true,
	},
	{ type: "local_shell" },
	{ type: "shell" },
	{ type: "apply_patch" },
	{ type: "tool_search", execution: "client" },
	{ type: "custom", name: "read.file" },
	{
		type: "namespace",
		name: "workspace",
		description: "Workspace tools",
		tools: [
			{ type: "function", name: "list-files" },
			{ type: "custom", name: "raw" },
		],
	},
];

function restore(providerName: string, args: string) {
	return restoreToolCallFromFunctionName({
		tools,
		providerName,
		callId: `call_${providerName}`,
		args,
		encodeName,
	});
}

describe("tool call restoration", () => {
	test("restores built-in calls downgraded through provider function tools", () => {
		expect(
			restore(
				"local_shell",
				'{"command":["pwd"],"env":{"CI":"1","IGNORED":false},"timeout_ms":0}',
			),
		).toEqual({
			id: "call_local_shell",
			type: "local_shell_call",
			call_id: "call_local_shell",
			action: {
				type: "exec",
				command: ["pwd"],
				env: { CI: "1" },
				timeout_ms: 0,
			},
			status: "in_progress",
		});

		expect(
			restore("shell", '{"commands":["bun test"],"max_output_length":0}'),
		).toEqual({
			type: "shell_call",
			call_id: "call_shell",
			action: {
				commands: ["bun test"],
				max_output_length: 0,
			},
			status: "in_progress",
		});

		expect(
			restore(
				"apply_patch",
				'{"operation":{"type":"delete_file","path":"old.ts"}}',
			),
		).toEqual({
			type: "apply_patch_call",
			call_id: "call_apply_patch",
			operation: { type: "delete_file", path: "old.ts" },
			status: "in_progress",
		});
	});

	test("restores tool_search, custom tools, and namespace function calls", () => {
		expect(restore("weather_now", '{"city":"Beijing"}')).toEqual({
			type: "function_call",
			call_id: "call_weather_now",
			name: "weather.now",
			arguments: '{"city":"Beijing"}',
		});

		expect(restore("tool_search", '{"query":"provider"}')).toEqual({
			type: "tool_search_call",
			call_id: "call_tool_search",
			arguments: { query: "provider" },
			execution: "client",
			status: "in_progress",
		});

		expect(restore("read_file", '{"input":{"path":"README.md"}}')).toEqual({
			type: "custom_tool_call",
			call_id: "call_read_file",
			name: "read.file",
			input: '{"path":"README.md"}',
		});

		expect(restore("workspace__list-files", "{}")).toEqual({
			type: "function_call",
			call_id: "call_workspace__list-files",
			namespace: "workspace",
			name: "list-files",
			arguments: "{}",
		});

		expect(restore("workspace__raw", '{"input":"select 1"}')).toEqual({
			type: "custom_tool_call",
			call_id: "call_workspace__raw",
			namespace: "workspace",
			name: "raw",
			input: "select 1",
		});
	});

	test("returns null when a downgraded built-in call cannot be safely restored", () => {
		expect(restore("local_shell", '{"command":"pwd"}')).toBeNull();
		expect(
			restore("apply_patch", '{"operation":{"type":"delete_file"}}'),
		).toBeNull();
	});

	test("creates plain function calls for mapper fallbacks", () => {
		expect(createFunctionCall("call_1", "plain", "{}")).toEqual({
			type: "function_call",
			call_id: "call_1",
			name: "plain",
			arguments: "{}",
		});
	});
});
