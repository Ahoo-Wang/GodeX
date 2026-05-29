import { describe, expect, test } from "bun:test";
import { BridgeError } from "../../error";
import {
	renderFunctionDeclarations,
	renderProviderToolDeclarations,
} from "./declaration-renderer";
import { buildToolCatalog, flattenToolName } from "./tool-catalog";
import { ToolIdentityMap } from "./tool-identity";
import {
	createToolPlanningProfile,
	planTools,
	type ToolPlanningProfile,
} from "./tool-plan";

const kernelProfile: ToolPlanningProfile = {
	provider: "kernel-test",
	nativeToolTypes: new Set(["function"]),
	degradedToolTypes: new Map([
		["custom", "function"],
		["local_shell", "function"],
	]),
	toolChoice: new Set(["auto", "function"]),
	maxTools: 128,
};

describe("planTools", () => {
	test("creates planning profile from provider capabilities", () => {
		const profile = createToolPlanningProfile({
			provider: "acme",
			capabilities: {
				parameters: { supported: new Set() },
				tools: {
					supported: new Set(["function", "custom", "mcp"]),
					degraded: new Map([["custom", "function"]]),
					maxTools: 32,
				},
				toolChoice: { supported: new Set(["auto", "function"]) },
				responseFormats: { supported: new Set(["text"]) },
				reasoning: { effort: "none" },
				streaming: { usage: false },
			},
			toProviderName: (name) => `p_${name}`,
		});

		expect(profile.provider).toBe("acme");
		expect([...profile.nativeToolTypes].sort()).toEqual(["function", "mcp"]);
		expect(profile.degradedToolTypes.get("custom")).toBe("function");
		expect(profile.toolChoice).toEqual(new Set(["auto", "function"]));
		expect(profile.maxTools).toBe(32);
		expect(profile.toProviderName?.("lookup")).toBe("p_lookup");
	});

	test("tool_choice none disables tool declarations", () => {
		const plan = planTools({
			tools: [
				{
					type: "function",
					name: "lookup",
					parameters: {},
					strict: true,
				},
			],
			toolChoice: "none",
			profile: kernelProfile,
		});

		expect(plan).toEqual({
			enabled: false,
			declarations: [],
			providerToolChoice: undefined,
			decisions: [
				{
					path: "tool_choice",
					action: "supported",
					reason: "tool_choice none disables tool declarations.",
				},
			],
		});
	});

	test("downgrades supported built-in tools to function declarations", () => {
		const plan = planTools({
			tools: [{ type: "local_shell" }],
			toolChoice: undefined,
			profile: kernelProfile,
		});

		expect(plan.enabled).toBe(true);
		expect(plan.declarations).toEqual([
			{
				requestedType: "local_shell",
				providerType: "function",
				requestedName: "local_shell",
				providerName: "local_shell",
				tool: { type: "local_shell" },
			},
		]);
		expect(plan.decisions).toContainEqual({
			path: "tools[type=local_shell]",
			action: "degraded",
			reason:
				"kernel-test maps Responses tool 'local_shell' to provider tool 'function'.",
		});
	});

	test("rejects explicit unsupported tool choice before upstream", () => {
		expect(() =>
			planTools({
				tools: [{ type: "mcp", server_label: "repo" }],
				toolChoice: {
					type: "mcp",
					server_label: "repo",
					name: "list_files",
				},
				profile: kernelProfile,
			}),
		).toThrow(BridgeError);
		expect(() =>
			planTools({
				tools: [{ type: "mcp", server_label: "repo" }],
				toolChoice: {
					type: "mcp",
					server_label: "repo",
					name: "list_files",
				},
				profile: kernelProfile,
			}),
		).toThrow(
			"Explicit tool_choice cannot be satisfied by provider kernel-test.",
		);
	});

	test("degrades explicit custom tool_choice to provider-compatible function", () => {
		const plan = planTools({
			tools: [
				{
					type: "custom",
					name: "raw",
					description: "Raw input",
					format: { type: "text" },
				},
			],
			toolChoice: { type: "custom", name: "raw" },
			profile: kernelProfile,
		});

		expect(plan.providerToolChoice).toEqual({ type: "function", name: "raw" });
		expect(plan.decisions).toContainEqual(
			expect.objectContaining({
				path: "tool_choice",
				action: "degraded",
			}),
		);
	});

	test("degrades unsupported mode tool_choice to auto when possible", () => {
		const plan = planTools({
			tools: [
				{
					type: "function",
					name: "lookup",
					parameters: {},
					strict: true,
				},
			],
			toolChoice: "required",
			profile: kernelProfile,
		});

		expect(plan.providerToolChoice).toBe("auto");
		expect(plan.decisions).toContainEqual({
			path: "tool_choice",
			action: "degraded",
			reason:
				"kernel-test does not support tool_choice 'required'; downgraded to auto.",
		});
	});

	test("keeps supported mode tool_choice unchanged and rejects it when no fallback exists", () => {
		const supported = planTools({
			tools: [
				{
					type: "function",
					name: "lookup",
					parameters: {},
					strict: true,
				},
			],
			toolChoice: "auto",
			profile: kernelProfile,
		});

		expect(supported.providerToolChoice).toBe("auto");
		expect(supported.decisions).toContainEqual({
			path: "tool_choice",
			action: "supported",
			reason: "kernel-test supports tool_choice 'auto'.",
		});

		expect(() =>
			planTools({
				tools: [
					{
						type: "function",
						name: "lookup",
						parameters: {},
						strict: true,
					},
				],
				toolChoice: "required",
				profile: {
					...kernelProfile,
					toolChoice: new Set(),
				},
			}),
		).toThrow(BridgeError);
	});

	test("degrades explicit object tool_choice to auto when provider cannot force mapped type", () => {
		const plan = planTools({
			tools: [
				{
					type: "custom",
					name: "raw",
					description: "Raw input",
					format: { type: "text" },
				},
			],
			toolChoice: { type: "custom", name: "raw" },
			profile: {
				...kernelProfile,
				toolChoice: new Set(["auto"]),
			},
		});

		expect(plan.declarations).toEqual([
			{
				requestedType: "custom",
				providerType: "function",
				requestedName: "raw",
				providerName: "raw",
				tool: {
					type: "custom",
					name: "raw",
					description: "Raw input",
					format: { type: "text" },
				},
			},
		]);
		expect(plan.providerToolChoice).toBe("auto");
		expect(plan.decisions).toContainEqual({
			path: "tool_choice",
			action: "degraded",
			reason:
				"kernel-test cannot force tool_choice 'custom'; downgraded to auto.",
		});
	});

	test("rejects explicit mapped tool_choice when provider has no force or auto mode", () => {
		expect(() =>
			planTools({
				tools: [
					{
						type: "custom",
						name: "raw",
						description: "Raw input",
						format: { type: "text" },
					},
				],
				toolChoice: { type: "custom", name: "raw" },
				profile: {
					...kernelProfile,
					toolChoice: new Set(),
				},
			}),
		).toThrow(BridgeError);
	});

	test("renders native object tool choices for mcp and shell declarations", () => {
		const mcpChoice = planTools({
			tools: [
				{
					type: "mcp",
					server_label: "repo",
					server_url: "https://mcp.example.com",
				},
			],
			toolChoice: { type: "mcp", server_label: "repo", name: "list_files" },
			profile: {
				...kernelProfile,
				nativeToolTypes: new Set(["mcp"]),
				degradedToolTypes: new Map(),
				toolChoice: new Set(["mcp"]),
			},
		});
		const shellChoice = planTools({
			tools: [{ type: "shell" }],
			toolChoice: { type: "shell" },
			profile: {
				...kernelProfile,
				nativeToolTypes: new Set(["shell"]),
				degradedToolTypes: new Map(),
				toolChoice: new Set(["shell"]),
			},
		});

		expect(mcpChoice.providerToolChoice).toEqual({
			type: "mcp",
			server_label: "repo",
			name: "list_files",
		});
		expect(mcpChoice.decisions).toContainEqual({
			path: "tool_choice",
			action: "supported",
			reason: "kernel-test supports tool_choice 'mcp'.",
		});
		expect(shellChoice.providerToolChoice).toEqual({ type: "shell" });
	});

	test("renders provider-type-only tool_choice for non-function degraded object choices", () => {
		const plan = planTools({
			tools: [
				{
					type: "custom",
					name: "raw",
					description: "Raw input",
					format: { type: "text" },
				},
			],
			toolChoice: { type: "custom", name: "raw" },
			profile: {
				...kernelProfile,
				nativeToolTypes: new Set(),
				degradedToolTypes: new Map([["custom", "mcp"]]),
				toolChoice: new Set(["mcp"]),
			},
		});

		expect(plan.providerToolChoice as unknown).toEqual({ type: "mcp" });
		expect(plan.decisions).toContainEqual(
			expect.objectContaining({
				path: "tool_choice",
				action: "degraded",
				reason:
					"kernel-test maps tool_choice 'custom' to provider tool_choice 'mcp'.",
			}),
		);
	});

	test("uses planned provider name consistently for declarations and tool_choice", () => {
		const plan = planTools({
			tools: [
				{
					type: "function",
					name: "weather.now",
					parameters: {},
					strict: true,
				},
			],
			toolChoice: { type: "function", name: "weather.now" },
			profile: kernelProfile,
		});

		expect(plan.declarations[0]).toEqual(
			expect.objectContaining({
				requestedName: "weather.now",
				providerName: "weather_now",
			}),
		);
		expect(plan.providerToolChoice).toEqual({
			type: "function",
			name: "weather_now",
		});
		expect(
			renderFunctionDeclarations(plan.declarations)[0]?.function.name,
		).toBe("weather_now");
	});

	test("allocates deterministic provider names for colliding declarations", () => {
		const plan = planTools({
			tools: [
				{
					type: "function",
					name: "weather.now",
					parameters: {},
					strict: true,
				},
				{
					type: "function",
					name: "weather-now",
					parameters: {},
					strict: true,
				},
			],
			profile: kernelProfile,
		});

		expect(
			plan.declarations.map((declaration) => declaration.providerName),
		).toEqual(["weather_now", "weather-now"]);

		const collidingPlan = planTools({
			tools: [
				{
					type: "function",
					name: "weather.now",
					parameters: {},
					strict: true,
				},
				{
					type: "function",
					name: "weather_now",
					parameters: {},
					strict: true,
				},
			],
			profile: kernelProfile,
		});

		expect(
			collidingPlan.declarations.map((declaration) => declaration.providerName),
		).toEqual(["weather_now", "weather_now_2"]);
	});

	test("rejects identity map provider-name collisions", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "weather.now",
			providerName: "weather_now",
			requestedType: "function",
			providerType: "function",
		});

		expect(() =>
			identities.add({
				requestedName: "weather_now",
				providerName: "weather_now",
				requestedType: "function",
				providerType: "function",
			}),
		).toThrow(BridgeError);
	});

	test("adds identity declarations in batches without changing identical mappings", () => {
		const identities = new ToolIdentityMap();

		identities.addDeclarations([
			{
				requestedName: "weather.now",
				providerName: "weather_now",
				requestedType: "function",
				providerType: "function",
			},
		]);
		identities.add({
			requestedName: "weather.now",
			providerName: "weather_now",
			requestedType: "function",
			providerType: "function",
		});

		expect(identities.get("weather_now")).toEqual({
			requestedName: "weather.now",
			providerName: "weather_now",
			requestedType: "function",
			providerType: "function",
		});
	});

	test("renders built-in and custom function declarations with strict bridge schemas", () => {
		const plan = planTools({
			tools: [
				{ type: "local_shell" },
				{
					type: "custom",
					name: "raw.tool",
					description: "Run raw input.",
					format: { type: "text" },
				},
			],
			profile: kernelProfile,
		});

		const declarations = renderFunctionDeclarations(plan.declarations);

		expect(declarations[0]?.function).toEqual(
			expect.objectContaining({
				name: "local_shell",
				description: expect.stringContaining(
					"Run exactly one local executable",
				),
				parameters: expect.objectContaining({
					required: ["command"],
					additionalProperties: false,
				}),
			}),
		);
		expect(declarations[1]?.function).toEqual(
			expect.objectContaining({
				name: "raw_tool",
				description: expect.stringContaining("Run raw input."),
				parameters: {
					type: "object",
					properties: {
						input: {
							type: "string",
							description: expect.stringContaining("Input format: text."),
						},
					},
					required: ["input"],
				},
			}),
		);
	});

	test("renders Zhipu-native web search declarations after preview degradation", () => {
		const plan = planTools({
			tools: [{ type: "web_search_preview", search_context_size: "high" }],
			profile: {
				...kernelProfile,
				nativeToolTypes: new Set(["web_search"]),
				degradedToolTypes: new Map([["web_search_preview", "web_search"]]),
			},
		});

		expect(renderProviderToolDeclarations(plan.declarations)).toEqual([
			{
				type: "web_search",
				web_search: {
					enable: true,
					search_engine: "search_std",
					content_size: "high",
				},
			},
		]);
	});

	test("renders native retrieval and mcp declarations from provider plans", () => {
		const plan = planTools({
			tools: [
				{
					type: "file_search",
					vector_store_ids: ["knowledge_1"],
				},
				{
					type: "mcp",
					server_label: "repo",
					server_url: "https://mcp.example.com",
					allowed_tools: ["list_files"],
					headers: { Authorization: "Bearer token" },
				},
			],
			profile: {
				...kernelProfile,
				nativeToolTypes: new Set(["mcp"]),
				degradedToolTypes: new Map([["file_search", "retrieval"]]),
			},
		});

		expect(
			plan.declarations.map((declaration) => declaration.requestedName),
		).toEqual(["file_search_0", "mcp_1"]);
		expect(renderProviderToolDeclarations(plan.declarations)).toEqual([
			{
				type: "retrieval",
				retrieval: { knowledge_id: "knowledge_1" },
			},
			{
				type: "mcp",
				mcp: {
					server_label: "repo",
					server_url: "https://mcp.example.com",
					allowed_tools: ["list_files"],
					headers: { Authorization: "Bearer token" },
				},
			},
		]);
	});

	test("omits unrenderable native declarations before request assembly", () => {
		const plan = planTools({
			tools: [
				{
					type: "file_search",
					vector_store_ids: [],
				},
			],
			profile: {
				...kernelProfile,
				nativeToolTypes: new Set(),
				degradedToolTypes: new Map([["file_search", "retrieval"]]),
			},
		});

		expect(plan.declarations).toHaveLength(1);
		expect(renderProviderToolDeclarations(plan.declarations)).toEqual([]);
	});

	test("renders a generic function schema for degraded tools without a bridge schema", () => {
		const plan = planTools({
			tools: [
				{
					type: "file_search",
					vector_store_ids: ["knowledge_1"],
				},
			],
			profile: {
				...kernelProfile,
				nativeToolTypes: new Set(),
				degradedToolTypes: new Map([["file_search", "function"]]),
			},
		});

		expect(renderFunctionDeclarations(plan.declarations)).toEqual([
			{
				type: "function",
				function: {
					name: "file_search_0",
					parameters: {
						type: "object",
						additionalProperties: true,
					},
				},
			},
		]);
	});

	test("builds catalog entries for namespace tools and fallback-named tools", () => {
		expect(
			flattenToolName({ namespace: "workspace", name: "list-files" }),
		).toBe("workspace__list-files");
		expect(buildToolCatalog(undefined)).toEqual([]);
		expect(
			buildToolCatalog([
				{
					type: "namespace",
					name: "workspace",
					description: "Workspace tools",
					tools: [
						{
							type: "function",
							name: "read.file",
							parameters: { type: "object" },
							strict: true,
						},
						{
							type: "custom",
							name: "search",
							format: { type: "text" },
						},
					],
				},
				{ type: "web_search_preview" },
			]),
		).toEqual([
			expect.objectContaining({
				type: "function",
				name: "workspace__read.file",
				tool: expect.objectContaining({ name: "workspace__read.file" }),
			}),
			expect.objectContaining({
				type: "custom",
				name: "workspace__search",
				tool: expect.objectContaining({ name: "workspace__search" }),
			}),
			expect.objectContaining({
				type: "web_search_preview",
				name: "web_search_preview_1",
			}),
		]);
	});

	test("fails before upstream when provider declarations exceed maxTools", () => {
		expect(() =>
			planTools({
				tools: [
					{
						type: "function",
						name: "one",
						parameters: {},
						strict: true,
					},
					{
						type: "function",
						name: "two",
						parameters: {},
						strict: true,
					},
				],
				profile: {
					...kernelProfile,
					maxTools: 1,
				},
			}),
		).toThrow(BridgeError);
	});
});
