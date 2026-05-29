import { describe, expect, test } from "bun:test";
import { restoreToolCall } from "./call-restorer";
import { ToolIdentityMap } from "./tool-identity";

describe("restoreToolCall", () => {
	test("restores downgraded local_shell provider calls", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "local_shell",
			providerName: "local_shell",
			requestedType: "local_shell",
			providerType: "function",
		});

		const item = restoreToolCall(
			{
				callId: "call_local_shell",
				name: "local_shell",
				arguments: JSON.stringify({
					cmd: ["bun", "test"],
					env: { CI: "true", ignored: 1 },
				}),
			},
			identities,
		);

		expect(item).toEqual({
			id: "call_local_shell",
			type: "local_shell_call",
			call_id: "call_local_shell",
			status: "in_progress",
			action: {
				type: "exec",
				command: ["bun", "test"],
				env: { CI: "true" },
			},
		});
	});

	test("falls back to function_call for unknown provider calls", () => {
		const item = restoreToolCall(
			{
				callId: "call_lookup",
				name: "lookup",
				arguments: '{"city":"Hangzhou"}',
			},
			new ToolIdentityMap(),
		);

		expect(item).toEqual({
			type: "function_call",
			call_id: "call_lookup",
			name: "lookup",
			arguments: '{"city":"Hangzhou"}',
		});
	});

	test("restores downgraded custom provider calls", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "read-file",
			providerName: "read-file",
			requestedType: "custom",
			providerType: "function",
		});

		const item = restoreToolCall(
			{
				callId: "call_custom",
				name: "read-file",
				arguments: JSON.stringify({ input: "src/index.ts" }),
			},
			identities,
		);

		expect(item).toEqual({
			type: "custom_tool_call",
			call_id: "call_custom",
			name: "read-file",
			input: "src/index.ts",
		});
	});

	test("falls back to function_call for invalid local_shell arguments", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "local_shell",
			providerName: "local_shell",
			requestedType: "local_shell",
			providerType: "function",
		});

		const item = restoreToolCall(
			{
				callId: "call_local_shell",
				name: "local_shell",
				arguments: "bun test",
			},
			identities,
		);

		expect(item).toEqual({
			type: "function_call",
			call_id: "call_local_shell",
			name: "local_shell",
			arguments: "bun test",
		});
	});

	test("preserves shell action fields", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "shell",
			providerName: "shell",
			requestedType: "shell",
			providerType: "function",
		});

		const item = restoreToolCall(
			{
				callId: "call_shell",
				name: "shell",
				arguments: JSON.stringify({
					commands: ["bun test"],
					timeout_ms: 1000,
					max_output_length: 4096,
				}),
			},
			identities,
		);

		expect(item).toEqual({
			type: "shell_call",
			call_id: "call_shell",
			status: "in_progress",
			action: {
				commands: ["bun test"],
				timeout_ms: 1000,
				max_output_length: 4096,
			},
		});
	});

	test("restores valid apply_patch calls", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "apply_patch",
			providerName: "apply_patch",
			requestedType: "apply_patch",
			providerType: "function",
		});

		const item = restoreToolCall(
			{
				callId: "call_patch",
				name: "apply_patch",
				arguments: JSON.stringify({
					operation: {
						type: "delete_file",
						path: "tmp.txt",
					},
				}),
			},
			identities,
		);

		expect(item).toEqual({
			type: "apply_patch_call",
			call_id: "call_patch",
			status: "in_progress",
			operation: {
				type: "delete_file",
				path: "tmp.txt",
			},
		});
	});

	test("restores apply_patch update operations with diff payloads", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "apply_patch",
			providerName: "apply_patch",
			requestedType: "apply_patch",
			providerType: "function",
		});

		const item = restoreToolCall(
			{
				callId: "call_patch",
				name: "apply_patch",
				arguments: JSON.stringify({
					operation: {
						type: "update_file",
						path: "src/index.ts",
						diff: "@@ patch",
					},
				}),
			},
			identities,
		);

		expect(item).toEqual({
			type: "apply_patch_call",
			call_id: "call_patch",
			status: "in_progress",
			operation: {
				type: "update_file",
				path: "src/index.ts",
				diff: "@@ patch",
			},
		});
	});
});
