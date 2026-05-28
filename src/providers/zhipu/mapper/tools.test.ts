// src/providers/zhipu/tools.test.ts
import { describe, expect, test } from "bun:test";
import { AdapterError } from "../../../error";
import { mapZhipuToolChoice, mapZhipuTools } from "./tools";

describe("mapZhipuTools", () => {
	test("maps function tool names to provider-compatible names", () => {
		const result = mapZhipuTools([
			{
				type: "function",
				name: "weather.now",
				parameters: {
					type: "object",
					properties: { city: { type: "string" } },
					required: ["city"],
				},
				strict: true,
				description: "Get weather",
			},
		]);

		expect(result).toEqual([
			{
				type: "function",
				function: {
					name: "weather_now",
					parameters: {
						type: "object",
						properties: { city: { type: "string" } },
						required: ["city"],
					},
					description: "Get weather",
				},
			},
		]);
	});

	test("maps web_search tool", () => {
		const result = mapZhipuTools([{ type: "web_search" }]);

		expect(result).toEqual([
			{
				type: "web_search",
				web_search: {
					enable: true,
					search_engine: "search_pro",
				},
			},
		]);
	});

	test("maps web_search tool with filters", () => {
		const result = mapZhipuTools([
			{
				type: "web_search",
				search_context_size: "high",
				filters: { allowed_domains: ["example.com"] },
			},
		]);

		expect(result[0]).toMatchObject({
			type: "web_search",
			web_search: {
				enable: true,
				search_engine: "search_pro",
				content_size: "high",
			},
		});
	});

	test("maps web_search_preview as a web search downgrade", () => {
		const result = mapZhipuTools([
			{
				type: "web_search_preview",
				search_context_size: "low",
			},
		]);

		expect(result).toEqual([
			{
				type: "web_search",
				web_search: {
					enable: true,
					search_engine: "search_pro",
					content_size: "medium",
				},
			},
		]);
	});

	test("maps file_search → retrieval tool", () => {
		const result = mapZhipuTools([
			{
				type: "file_search",
				vector_store_ids: ["vs_abc"],
			},
		]);

		expect(result).toEqual([
			{
				type: "retrieval",
				retrieval: { knowledge_id: "vs_abc" },
			},
		]);
	});

	test("maps mcp tool", () => {
		const result = mapZhipuTools([
			{
				type: "mcp",
				server_label: "my-mcp",
				server_url: "https://mcp.example.com",
				allowed_tools: ["tool_a"],
			},
		]);

		expect(result).toEqual([
			{
				type: "mcp",
				mcp: {
					server_label: "my-mcp",
					server_url: "https://mcp.example.com",
					allowed_tools: ["tool_a"],
					transport_type: "streamable-http",
				},
			},
		]);
	});

	test("downgrades mcp allowed_tools filters to explicit tool names", () => {
		const result = mapZhipuTools([
			{
				type: "mcp",
				server_label: "my-mcp",
				allowed_tools: { tool_names: ["read_file", "list_files"] },
			},
		]);

		expect(result).toEqual([
			{
				type: "mcp",
				mcp: {
					server_label: "my-mcp",
					allowed_tools: ["read_file", "list_files"],
					transport_type: "streamable-http",
				},
			},
		]);
	});

	test("downgrades Codex client tools to function tools", () => {
		const result = mapZhipuTools([
			{ type: "local_shell" },
			{ type: "shell", environment: { type: "local" } },
			{ type: "apply_patch" },
			{
				type: "custom",
				name: "read-file",
				description: "Read a file",
			},
			{
				type: "namespace",
				name: "workspace",
				description: "Workspace tools",
				tools: [
					{
						type: "function",
						name: "list-files",
						description: "List files",
						parameters: { type: "object" },
					},
					{
						type: "custom",
						name: "search",
						description: "Search text",
					},
				],
			},
			{ type: "tool_search", description: "Find available tools" },
		]);

		expect(result).toMatchObject([
			{ type: "function", function: { name: "local_shell" } },
			{ type: "function", function: { name: "shell" } },
			{ type: "function", function: { name: "apply_patch" } },
			{ type: "function", function: { name: "read_file" } },
			{ type: "function", function: { name: "workspace__list_files" } },
			{ type: "function", function: { name: "workspace__search" } },
			{ type: "function", function: { name: "tool_search" } },
		]);

		const [localShell, shell, applyPatch] = result;
		if (
			localShell?.type !== "function" ||
			shell?.type !== "function" ||
			applyPatch?.type !== "function"
		) {
			throw new Error("Expected Codex built-ins to map to function tools.");
		}
		expect(localShell.function.description).toContain("Use shell");
		expect(shell.function.description).toContain(
			"configured Codex shell environment",
		);
		expect(applyPatch.function.description).toContain(
			"Prefer this over shell commands",
		);
	});

	test("describes custom tool input format when downgraded to function", () => {
		const [tool] = mapZhipuTools([
			{
				type: "custom",
				name: "raw-sql",
				description: "Run a SQL statement",
				format: {
					type: "grammar",
					syntax: "lark",
					definition: "start: /.+/",
				},
			},
		]);

		expect(tool).toMatchObject({
			type: "function",
			function: {
				name: "raw_sql",
				description: expect.stringContaining("Input format: grammar (lark)"),
				parameters: {
					properties: {
						input: {
							description: expect.stringContaining("start: /.+/"),
						},
					},
				},
			},
		});
	});

	test("rejects function name collisions after Zhipu sanitization", () => {
		expect(() =>
			mapZhipuTools([
				{
					type: "custom",
					name: "read-file",
				},
				{
					type: "custom",
					name: "read_file",
				},
			]),
		).toThrow(AdapterError);
	});

	test("throws for unsupported tools by default", () => {
		expect(() =>
			mapZhipuTools([
				{
					type: "code_interpreter" as const,
					container: { type: "auto" as const },
				},
			]),
		).toThrow(AdapterError);
	});

	test("gracefully skips unsupported tools when requested", () => {
		const skipped: string[] = [];
		const result = mapZhipuTools(
			[
				{
					type: "code_interpreter" as const,
					container: { type: "auto" as const },
				},
				{
					type: "image_generation" as const,
				},
			],
			{
				unsupported: "skip",
				onUnsupported: (type) => skipped.push(type),
			},
		);

		expect(result).toEqual([]);
		expect(skipped).toEqual(["code_interpreter", "image_generation"]);
	});

	test("throws for file_search without vector_store_ids", () => {
		expect(() =>
			mapZhipuTools([
				{
					type: "file_search",
					vector_store_ids: [],
				},
			]),
		).toThrow(AdapterError);
	});

	test("returns empty array for undefined tools", () => {
		expect(mapZhipuTools(undefined)).toEqual([]);
	});
});

describe("mapZhipuToolChoice", () => {
	test('maps "auto" to "auto"', () => {
		expect(mapZhipuToolChoice("auto")).toBe("auto");
	});

	test('maps "none" to no provider tool_choice', () => {
		expect(mapZhipuToolChoice("none")).toBeUndefined();
	});

	test("downgrades unsupported provider tool choices to auto", () => {
		expect(mapZhipuToolChoice("required")).toBe("auto");
		expect(mapZhipuToolChoice({ type: "function", name: "foo" })).toBe("auto");
		expect(mapZhipuToolChoice({ type: "apply_patch" })).toBe("auto");
		expect(mapZhipuToolChoice({ type: "shell" })).toBe("auto");
	});
});
