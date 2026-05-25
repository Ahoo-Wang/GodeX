// src/providers/openai/tools.test.ts
import { describe, expect, test } from "bun:test";
import { mapToolChoice, mapTools } from "./tools";

describe("mapTools", () => {
	test("maps function tool — direct passthrough", () => {
		const result = mapTools([
			{
				type: "function",
				name: "get_weather",
				parameters: {
					type: "object",
					properties: { city: { type: "string" } },
					required: ["city"],
				},
				strict: true,
				description: "Get weather",
			},
		]);

		expect(result.tools).toEqual([
			{
				type: "function",
				function: {
					name: "get_weather",
					parameters: {
						type: "object",
						properties: { city: { type: "string" } },
						required: ["city"],
					},
					strict: true,
					description: "Get weather",
				},
			},
		]);
		expect(result.webSearchOptions).toBeUndefined();
	});

	test("maps web_search to web_search_options (not in tools array)", () => {
		const result = mapTools([{ type: "web_search" }]);

		expect(result.tools).toEqual([]);
		expect(result.webSearchOptions).toEqual({});
	});

	test("maps web_search with user_location", () => {
		const result = mapTools([
			{
				type: "web_search",
				search_context_size: "high",
				user_location: {
					city: "Beijing",
					country: "CN",
					region: "Beijing",
					timezone: "Asia/Shanghai",
				},
			},
		]);

		expect(result.tools).toEqual([]);
		expect(result.webSearchOptions).toEqual({
			search_context_size: "high",
			user_location: {
				type: "approximate",
				approximate: {
					city: "Beijing",
					country: "CN",
					region: "Beijing",
					timezone: "Asia/Shanghai",
				},
			},
		});
	});

	test("maps custom tool — direct passthrough", () => {
		const result = mapTools([
			{
				type: "custom",
				name: "read-file",
				description: "Read a file",
			},
		]);

		expect(result.tools).toEqual([
			{
				type: "custom",
				custom: {
					name: "read-file",
					description: "Read a file",
				},
			},
		]);
	});

	test("maps nested custom namespace tool to function tool", () => {
		const result = mapTools([
			{
				type: "namespace",
				name: "mcp__demo__",
				description: "Demo namespace",
				tools: [
					{
						type: "custom",
						name: "raw",
						description: "Raw input",
						format: { type: "text" },
					},
				],
			},
		]);

		expect(result.tools).toEqual([
			{
				type: "function",
				function: {
					name: "mcp__demo____raw",
					description: "Raw input",
					parameters: {
						type: "object",
						properties: { input: { type: "string" } },
						required: ["input"],
					},
				},
			},
		]);
		expect(result.webSearchOptions).toBeUndefined();
	});

	test("skips file_search and MCP tools", () => {
		const result = mapTools([
			{
				type: "file_search",
				vector_store_ids: ["vs_abc"],
			} as never,
			{
				type: "mcp",
				server_label: "my-mcp",
				server_url: "https://mcp.example.com",
				allowed_tools: ["tool_a"],
			} as never,
		]);

		expect(result.tools).toEqual([]);
		expect(result.webSearchOptions).toBeUndefined();
	});

	test("maps builtin tools (local_shell, shell, apply_patch) to function tools", () => {
		const result = mapTools([
			{ type: "local_shell" },
			{ type: "shell", environment: { type: "local" } },
			{ type: "apply_patch" },
		]);

		expect(result.tools).toHaveLength(3);
		expect(result.tools[0]?.type).toBe("function");
		expect(result.tools[1]?.type).toBe("function");
		expect(result.tools[2]?.type).toBe("function");

		if (
			result.tools[0]?.type === "function" &&
			result.tools[1]?.type === "function" &&
			result.tools[2]?.type === "function"
		) {
			expect(result.tools[0].function.name).toBe("local_shell");
			expect(result.tools[1].function.name).toBe("shell");
			expect(result.tools[2].function.name).toBe("apply_patch");
		}
	});

	test("returns empty result for undefined tools", () => {
		const result = mapTools(undefined);

		expect(result.tools).toEqual([]);
		expect(result.webSearchOptions).toBeUndefined();
	});

	test("maps web_search_preview to web_search_options", () => {
		const result = mapTools([
			{
				type: "web_search_preview",
				search_context_size: "low",
			},
		]);

		expect(result.tools).toEqual([]);
		expect(result.webSearchOptions).toEqual({
			search_context_size: "low",
		});
	});
});

describe("mapToolChoice", () => {
	test('maps "auto" to "auto"', () => {
		expect(mapToolChoice("auto")).toBe("auto");
	});

	test('maps "none" to "none"', () => {
		expect(mapToolChoice("none")).toBe("none");
	});

	test('maps "required" to "required"', () => {
		expect(mapToolChoice("required")).toBe("required");
	});

	test("maps function tool choice to named function choice", () => {
		const result = mapToolChoice({ type: "function", name: "get_weather" });

		expect(result).toEqual({
			type: "function",
			function: { name: "get_weather" },
		});
	});

	test("maps custom tool choice to named custom choice", () => {
		const result = mapToolChoice({ type: "custom", name: "read-file" });

		expect(result).toEqual({
			type: "custom",
			custom: { name: "read-file" },
		});
	});

	test("maps allowed_tools tool choice", () => {
		const result = mapToolChoice({
			type: "allowed_tools",
			mode: "auto",
			tools: [{ type: "function", name: "get_weather" }],
		});

		expect(result).toEqual({
			type: "allowed_tools",
			allowed_tools: {
				mode: "auto",
				tools: [{ type: "function", name: "get_weather" }],
			},
		});
	});

	test("maps unknown tool choice to auto", () => {
		expect(mapToolChoice("unknown_value" as never)).toBe("auto");
	});

	test("maps undefined to undefined", () => {
		expect(mapToolChoice(undefined)).toBeUndefined();
	});
});
