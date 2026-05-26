import { describe, expect, test } from "bun:test";
import type { ChatToolCallIdentity } from "../../../adapter/mapper/chat/contract";
import type { ToolCallSnapshot } from "../../../adapter/mapper/chat/stream-response-state";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type {
	ResponseCreateRequest,
	ResponseTool,
} from "../../../protocol/openai/responses";
import {
	DeepSeekToolCallIdentityResolver,
	DeepSeekToolCallMapper,
	mapDeepSeekToolCall,
} from "./tool-calls";

function ctx(tools: ResponseTool[] | undefined): ResponsesContext {
	return {
		request: {
			model: "deepseek-v4-flash",
			input: "Hello",
			tools,
		} as ResponseCreateRequest,
		resolved: { provider: "deepseek", model: "deepseek-v4-flash" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as ApplicationContext,
		provider: { name: "deepseek", mapper: {} as never, client: {} as never },
		diagnostics: [],
		addDiagnostic() {},
	} as unknown as ResponsesContext;
}

function call(
	name: string,
	args: Record<string, unknown> | string,
	id = `call_${name}`,
): ToolCallSnapshot {
	return {
		index: 0,
		id,
		name,
		arguments: typeof args === "string" ? args : JSON.stringify(args),
	};
}

const tools: ResponseTool[] = [
	{ type: "local_shell" },
	{ type: "shell" },
	{ type: "apply_patch" },
	{ type: "tool_search", execution: "client" },
	{ type: "custom", name: "read.file" },
	{
		type: "namespace",
		name: "workspace",
		description: "Workspace tools",
		tools: [{ type: "function", name: "list-files" }],
	},
];

describe("DeepSeek tool call mapping", () => {
	test("resolves flattened namespace tool identities", () => {
		const resolver = new DeepSeekToolCallIdentityResolver();

		expect(resolver.resolve(ctx(tools), "workspace__list-files")).toEqual({
			upstreamName: "workspace__list-files",
			namespace: "workspace",
			name: "list-files",
		});
		expect(resolver.resolve(ctx(tools), "plain_tool")).toEqual({
			upstreamName: "plain_tool",
			name: "plain_tool",
		});
	});

	test("maps downgraded built-in and custom calls from response output", () => {
		const c = ctx(tools);

		expect(
			mapDeepSeekToolCall(
				c,
				call("local_shell", {
					command: ["bun", "--version"],
					env: { CI: "1", IGNORED: false },
					timeout_ms: 1000,
					user: "tester",
					working_directory: "/tmp/project",
				}),
			),
		).toEqual({
			id: "call_local_shell",
			type: "local_shell_call",
			call_id: "call_local_shell",
			action: {
				type: "exec",
				command: ["bun", "--version"],
				env: { CI: "1" },
				timeout_ms: 1000,
				user: "tester",
				working_directory: "/tmp/project",
			},
			status: "in_progress",
		});
		expect(
			mapDeepSeekToolCall(
				c,
				call("shell", {
					commands: ["bun test"],
					timeout_ms: 2000,
					max_output_length: 4096,
				}),
			),
		).toEqual({
			type: "shell_call",
			call_id: "call_shell",
			action: {
				commands: ["bun test"],
				timeout_ms: 2000,
				max_output_length: 4096,
			},
			status: "in_progress",
		});
		expect(
			mapDeepSeekToolCall(
				c,
				call("apply_patch", {
					operation: {
						type: "update_file",
						path: "src/index.ts",
						diff: "@@ -1 +1 @@",
					},
				}),
			),
		).toEqual({
			type: "apply_patch_call",
			call_id: "call_apply_patch",
			operation: {
				type: "update_file",
				path: "src/index.ts",
				diff: "@@ -1 +1 @@",
			},
			status: "in_progress",
		});
		expect(mapDeepSeekToolCall(c, call("tool_search", "not json"))).toEqual({
			type: "tool_search_call",
			call_id: "call_tool_search",
			arguments: "not json",
			execution: "client",
			status: "in_progress",
		});
		expect(
			mapDeepSeekToolCall(
				c,
				call("read_file", { input: { path: "README.md" } }, "call_read"),
			),
		).toEqual({
			type: "custom_tool_call",
			call_id: "call_read",
			name: "read.file",
			input: '{"path":"README.md"}',
		});
		expect(
			mapDeepSeekToolCall(c, call("workspace__list-files", {}, "call_list")),
		).toEqual({
			type: "function_call",
			call_id: "call_list",
			namespace: "workspace",
			name: "list-files",
			arguments: "{}",
		});
	});

	test("falls back to function calls when downgraded arguments are invalid", () => {
		const c = ctx(tools);

		expect(
			mapDeepSeekToolCall(c, call("local_shell", { command: "bun" })),
		).toEqual({
			type: "function_call",
			call_id: "call_local_shell",
			name: "local_shell",
			arguments: '{"command":"bun"}',
		});
		expect(
			mapDeepSeekToolCall(
				c,
				call("apply_patch", { operation: { type: "delete_file" } }),
			),
		).toEqual({
			type: "function_call",
			call_id: "call_apply_patch",
			name: "apply_patch",
			arguments: '{"operation":{"type":"delete_file"}}',
		});
	});

	test("maps streaming tool calls through provider identities", () => {
		const mapper = new DeepSeekToolCallMapper();
		const c = ctx(tools);
		const identity: ChatToolCallIdentity = {
			upstreamName: "local_shell",
			name: "local_shell",
		};

		expect(
			mapper.map(
				c,
				call("local_shell", { command: ["pwd"] }, "call_stream_shell"),
				identity,
			),
		).toEqual({
			id: "call_stream_shell",
			type: "local_shell_call",
			call_id: "call_stream_shell",
			action: { type: "exec", command: ["pwd"], env: {} },
			status: "in_progress",
		});
		expect(
			mapper.map(c, call("ignored", {}, "call_namespaced"), {
				upstreamName: "workspace__list-files",
				namespace: "workspace",
				name: "list-files",
			}),
		).toEqual({
			type: "function_call",
			call_id: "call_namespaced",
			namespace: "workspace",
			name: "list-files",
			arguments: "{}",
		});
	});
});
