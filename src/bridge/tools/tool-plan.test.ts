import { describe, expect, test } from "bun:test";
import { BridgeError } from "../../error";
import {
	renderFunctionDeclarations,
	renderProviderToolDeclarations,
} from "./declaration-renderer";
import { ToolIdentityMap } from "./tool-identity";
import type { ToolPlanningProfile } from "./tool-plan";
import { planTools } from "./tool-plan";

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
