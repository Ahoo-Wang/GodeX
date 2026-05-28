import { describe, expect, test } from "bun:test";
import type { ResponseTool } from "../../protocol/openai/responses";
import {
	createToolIdentityIndex,
	findFlattenedNamespaceTool,
	findProviderToolIdentity,
	flattenToolName,
} from "./tool-identity";

const encodeName = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_");

const tools: ResponseTool[] = [
	{
		type: "function",
		name: "workspace__raw",
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

describe("tool identity", () => {
	test("flattens namespace names consistently", () => {
		expect(flattenToolName({ namespace: "workspace", name: "raw" })).toBe(
			"workspace__raw",
		);
		expect(flattenToolName({ name: "plain" })).toBe("plain");
	});

	test("indexes provider names back to original Responses tool identity", () => {
		const index = createToolIdentityIndex(tools, encodeName);

		expect(findProviderToolIdentity(index, "workspace__list-files")).toEqual({
			type: "namespace_function",
			providerName: "workspace__list-files",
			namespace: "workspace",
			name: "list-files",
		});
		expect(findProviderToolIdentity(index, "workspace__raw")).toEqual({
			type: "namespace_custom",
			providerName: "workspace__raw",
			namespace: "workspace",
			name: "raw",
		});
		expect(findProviderToolIdentity(index, "read_file")).toEqual({
			type: "custom",
			providerName: "read_file",
			name: "read.file",
		});
		expect(findProviderToolIdentity(index, "tool_search")).toEqual({
			type: "tool_search",
			providerName: "tool_search",
			execution: "client",
		});
		expect(findProviderToolIdentity(index, "shell")).toEqual({
			type: "shell",
			providerName: "shell",
		});
	});

	test("keeps namespace identity ahead of top-level name collisions", () => {
		const index = createToolIdentityIndex(tools, encodeName);

		expect(findProviderToolIdentity(index, "workspace__raw")).toEqual({
			type: "namespace_custom",
			providerName: "workspace__raw",
			namespace: "workspace",
			name: "raw",
		});
	});

	test("exposes flattened namespace lookup from the same identity index rules", () => {
		expect(
			findFlattenedNamespaceTool(tools, "workspace__list-files", encodeName),
		).toEqual({
			namespace: "workspace",
			name: "list-files",
		});
		expect(
			findFlattenedNamespaceTool(tools, "read_file", encodeName),
		).toBeNull();
	});
});
