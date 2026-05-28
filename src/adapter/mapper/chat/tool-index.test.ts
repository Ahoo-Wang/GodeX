import { describe, expect, test } from "bun:test";
import type { ResponseTool } from "../../../protocol/openai/responses";
import {
	flattenToolName,
	ProviderToolIndex,
	ToolIdentityCatalog,
} from "./tool-index";

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

describe("ProviderToolIndex", () => {
	test("encapsulates provider declarations, sidecars, and call restoration", () => {
		const index = new ProviderToolIndex({
			declarations: ["weather_now"],
			sidecars: { webSearchOptions: { search_context_size: "high" } },
			identityCatalog: ToolIdentityCatalog.fromTools(tools, encodeName),
		});

		expect(flattenToolName({ namespace: "workspace", name: "raw" })).toBe(
			"workspace__raw",
		);
		expect(index.hasDeclarations()).toBe(true);
		expect(index.declarations()).toEqual(["weather_now"]);
		expect(index.sidecars()).toEqual({
			webSearchOptions: { search_context_size: "high" },
		});

		const route = index.resolveProviderCall("workspace__raw");
		expect(route?.identity()).toEqual({
			type: "namespace_custom",
			providerName: "workspace__raw",
			namespace: "workspace",
			name: "raw",
		});
		expect(route?.restore("call_workspace", '{"input":"select 1"}')).toEqual({
			type: "custom_tool_call",
			call_id: "call_workspace",
			namespace: "workspace",
			name: "raw",
			input: "select 1",
		});
	});

	test("keeps namespace identities ahead of top-level provider-name collisions", () => {
		const index = new ProviderToolIndex({
			declarations: [],
			identityCatalog: ToolIdentityCatalog.fromTools(
				[
					{
						type: "function",
						name: "workspace__raw",
						parameters: { type: "object" },
						strict: true,
					},
					{
						type: "namespace",
						name: "workspace",
						description: "Workspace tools",
						tools: [{ type: "custom", name: "raw" }],
					},
				],
				encodeName,
			),
		});

		expect(index.resolveProviderCall("workspace__raw")?.identity()).toEqual({
			type: "namespace_custom",
			providerName: "workspace__raw",
			namespace: "workspace",
			name: "raw",
		});
	});

	test("restores apply_patch calls using the protocol operation shapes", () => {
		const index = new ProviderToolIndex({
			declarations: [],
			identityCatalog: ToolIdentityCatalog.fromTools([{ type: "apply_patch" }]),
		});
		const route = index.resolveProviderCall("apply_patch");

		expect(
			route?.restore(
				"call_create",
				JSON.stringify({
					operation: {
						type: "create_file",
						path: "README.md",
						diff: "@@\n+hello\n",
					},
				}),
			),
		).toEqual({
			type: "apply_patch_call",
			call_id: "call_create",
			operation: {
				type: "create_file",
				path: "README.md",
				diff: "@@\n+hello\n",
			},
			status: "in_progress",
		});
		expect(
			route?.restore(
				"call_delete",
				JSON.stringify({
					operation: { type: "delete_file", path: "tmp.txt" },
				}),
			),
		).toEqual({
			type: "apply_patch_call",
			call_id: "call_delete",
			operation: { type: "delete_file", path: "tmp.txt" },
			status: "in_progress",
		});
	});

	test("rejects apply_patch operations that do not match the protocol", () => {
		const index = new ProviderToolIndex({
			declarations: [],
			identityCatalog: ToolIdentityCatalog.fromTools([{ type: "apply_patch" }]),
		});
		const route = index.resolveProviderCall("apply_patch");

		expect(
			route?.restore(
				"call_legacy",
				JSON.stringify({
					operation: {
						type: "add_file",
						path: "README.md",
						diff: "@@\n+hello\n",
					},
				}),
			),
		).toBeNull();
		expect(
			route?.restore(
				"call_missing_diff",
				JSON.stringify({
					operation: { type: "update_file", path: "README.md" },
				}),
			),
		).toBeNull();
	});
});
