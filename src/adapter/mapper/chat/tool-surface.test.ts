import { describe, expect, test } from "bun:test";
import type { ResponseTool } from "../../../protocol/openai/responses";
import {
	flattenToolName,
	ProviderToolSurface,
	ToolIdentityCatalog,
} from "./tool-surface";

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

describe("ProviderToolSurface", () => {
	test("encapsulates provider declarations, sidecars, and call restoration", () => {
		const surface = new ProviderToolSurface({
			declarations: ["weather_now"],
			sidecars: { webSearchOptions: { search_context_size: "high" } },
			identityCatalog: ToolIdentityCatalog.fromTools(tools, encodeName),
		});

		expect(flattenToolName({ namespace: "workspace", name: "raw" })).toBe(
			"workspace__raw",
		);
		expect(surface.hasDeclarations()).toBe(true);
		expect(surface.declarations()).toEqual(["weather_now"]);
		expect(surface.sidecars()).toEqual({
			webSearchOptions: { search_context_size: "high" },
		});

		const route = surface.resolveProviderCall("workspace__raw");
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
		const surface = new ProviderToolSurface({
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

		expect(surface.resolveProviderCall("workspace__raw")?.identity()).toEqual({
			type: "namespace_custom",
			providerName: "workspace__raw",
			namespace: "workspace",
			name: "raw",
		});
	});
});
