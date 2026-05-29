import { BRIDGE_REQUEST_UNSUPPORTED_PARAMETER, BridgeError } from "../../error";
import type {
	ResponseTool,
	ResponseToolChoice,
} from "../../protocol/openai/responses";
import type { ProviderCapabilities } from "../compatibility";
import { buildToolCatalog, type ToolCatalogEntry } from "./tool-catalog";
import {
	isToolChoiceMode,
	renderProviderToolChoice,
	requestedToolChoiceType,
} from "./tool-choice";
import { defaultToolNameCodec } from "./tool-identity";

export interface ToolPlanningProfile {
	readonly provider: string;
	readonly nativeToolTypes: ReadonlySet<string>;
	readonly degradedToolTypes: ReadonlyMap<string, string>;
	readonly toolChoice: ReadonlySet<string>;
	readonly maxTools?: number;
	readonly toProviderName?: (name: string) => string;
}

export function createToolPlanningProfile(input: {
	readonly provider: string;
	readonly capabilities: ProviderCapabilities;
	readonly toProviderName?: (name: string) => string;
}): ToolPlanningProfile {
	const degraded =
		input.capabilities.tools.degraded ?? new Map<string, string>();
	return {
		provider: input.provider,
		nativeToolTypes: new Set(
			[...input.capabilities.tools.supported].filter(
				(type) => !degraded.has(type),
			),
		),
		degradedToolTypes: degraded,
		toolChoice: input.capabilities.toolChoice.supported,
		maxTools: input.capabilities.tools.maxTools,
		toProviderName: input.toProviderName,
	};
}

export interface ToolDeclarationPlan {
	readonly requestedType: string;
	readonly providerType: string;
	readonly requestedName: string;
	readonly providerName: string;
	readonly tool: ResponseTool;
}

export interface PlannedToolDecision {
	readonly path: string;
	readonly action: "supported" | "degraded" | "ignored" | "rejected";
	readonly reason: string;
}

export interface ToolPlan {
	readonly enabled: boolean;
	readonly declarations: readonly ToolDeclarationPlan[];
	readonly providerToolChoice?: ResponseToolChoice;
	readonly decisions: readonly PlannedToolDecision[];
}

export function planTools(input: {
	readonly tools?: readonly ResponseTool[];
	readonly toolChoice?: ResponseToolChoice;
	readonly profile: ToolPlanningProfile;
}): ToolPlan {
	const decisions: PlannedToolDecision[] = [];
	if (input.toolChoice === "none") {
		return {
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
		};
	}

	const allocateProviderName = createProviderNameAllocator(
		input.profile.toProviderName ?? defaultToolNameCodec,
	);
	const declarations = buildToolCatalog(input.tools).flatMap((entry) =>
		planToolDeclaration(entry, input.profile, decisions, allocateProviderName),
	);
	assertMaxTools(declarations, input.profile);
	const providerToolChoice = planProviderToolChoice({
		toolChoice: input.toolChoice,
		declarations,
		profile: input.profile,
		decisions,
	});
	return {
		enabled: declarations.length > 0,
		declarations,
		...(providerToolChoice !== undefined ? { providerToolChoice } : {}),
		decisions,
	};
}

function planToolDeclaration(
	entry: ToolCatalogEntry,
	profile: ToolPlanningProfile,
	decisions: PlannedToolDecision[],
	allocateProviderName: (requestedName: string) => string,
): ToolDeclarationPlan[] {
	if (profile.nativeToolTypes.has(entry.type)) {
		decisions.push({
			path: `tools[type=${entry.type}]`,
			action: "supported",
			reason: `${profile.provider} supports Responses tool '${entry.type}'.`,
		});
		return [
			{
				requestedType: entry.type,
				providerType: entry.type,
				requestedName: entry.name,
				providerName: allocateProviderName(entry.name),
				tool: entry.tool,
			},
		];
	}

	const providerType = profile.degradedToolTypes.get(entry.type);
	if (providerType) {
		decisions.push({
			path: `tools[type=${entry.type}]`,
			action: "degraded",
			reason: `${profile.provider} maps Responses tool '${entry.type}' to provider tool '${providerType}'.`,
		});
		return [
			{
				requestedType: entry.type,
				providerType,
				requestedName: entry.name,
				providerName: allocateProviderName(entry.name),
				tool: entry.tool,
			},
		];
	}

	decisions.push({
		path: `tools[type=${entry.type}]`,
		action: "ignored",
		reason: `${profile.provider} does not support Responses tool '${entry.type}'; skipping declaration.`,
	});
	return [];
}

function createProviderNameAllocator(
	toProviderName: (name: string) => string,
): (requestedName: string) => string {
	const usedNames = new Set<string>();
	return (requestedName) => {
		const baseName = toProviderName(requestedName);
		let providerName = baseName;
		let index = 2;
		while (usedNames.has(providerName)) {
			const suffix = `_${index}`;
			providerName = `${baseName.slice(0, 64 - suffix.length)}${suffix}`;
			index += 1;
		}
		usedNames.add(providerName);
		return providerName;
	};
}

function assertMaxTools(
	declarations: readonly ToolDeclarationPlan[],
	profile: ToolPlanningProfile,
): void {
	if (
		profile.maxTools === undefined ||
		declarations.length <= profile.maxTools
	) {
		return;
	}
	throw new BridgeError(
		BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
		`${profile.provider} accepts at most ${profile.maxTools} mapped tools; received ${declarations.length}.`,
		{
			provider: profile.provider,
			model: "unknown",
			parameter: "tools",
			maxTools: profile.maxTools,
			toolCount: declarations.length,
		},
	);
}

function planProviderToolChoice(input: {
	readonly toolChoice?: ResponseToolChoice;
	readonly declarations: readonly ToolDeclarationPlan[];
	readonly profile: ToolPlanningProfile;
	readonly decisions: PlannedToolDecision[];
}): ResponseToolChoice | undefined {
	const toolChoice = input.toolChoice;
	if (toolChoice === undefined || toolChoice === "none") return undefined;
	if (isToolChoiceMode(toolChoice)) {
		return planModeProviderToolChoice(
			toolChoice,
			input.profile,
			input.decisions,
		);
	}

	const requestedType = requestedToolChoiceType(toolChoice);
	const declaration = input.declarations.find((candidate) =>
		toolChoiceMatchesDeclaration(toolChoice, candidate),
	);
	if (!declaration) {
		input.decisions.push({
			path: "tool_choice",
			action: "rejected",
			reason: `Explicit tool_choice cannot be satisfied by provider ${input.profile.provider}.`,
		});
		throw explicitToolChoiceError(input.profile.provider);
	}
	if (!input.profile.toolChoice.has(declaration.providerType)) {
		if (input.profile.toolChoice.has("auto")) {
			input.decisions.push({
				path: "tool_choice",
				action: "degraded",
				reason: `${input.profile.provider} cannot force tool_choice '${requestedType}'; downgraded to auto.`,
			});
			return "auto";
		}
		input.decisions.push({
			path: "tool_choice",
			action: "rejected",
			reason: `Explicit tool_choice cannot be satisfied by provider ${input.profile.provider}.`,
		});
		throw explicitToolChoiceError(input.profile.provider);
	}

	const providerToolChoice = renderProviderToolChoice({
		requested: toolChoice,
		providerType: declaration.providerType,
		providerName: declaration.providerName,
	});
	const action =
		declaration.providerType === requestedType ? "supported" : "degraded";
	input.decisions.push({
		path: "tool_choice",
		action,
		reason:
			action === "supported"
				? `${input.profile.provider} supports tool_choice '${requestedType}'.`
				: `${input.profile.provider} maps tool_choice '${requestedType}' to provider tool_choice '${declaration.providerType}'.`,
	});
	return providerToolChoice;
}

function planModeProviderToolChoice(
	toolChoice: "auto" | "required",
	profile: ToolPlanningProfile,
	decisions: PlannedToolDecision[],
): ResponseToolChoice | undefined {
	if (profile.toolChoice.has(toolChoice)) {
		decisions.push({
			path: "tool_choice",
			action: "supported",
			reason: `${profile.provider} supports tool_choice '${toolChoice}'.`,
		});
		return toolChoice;
	}
	if (profile.toolChoice.has("auto")) {
		decisions.push({
			path: "tool_choice",
			action: "degraded",
			reason: `${profile.provider} does not support tool_choice '${toolChoice}'; downgraded to auto.`,
		});
		return "auto";
	}
	decisions.push({
		path: "tool_choice",
		action: "rejected",
		reason: `Explicit tool_choice cannot be satisfied by provider ${profile.provider}.`,
	});
	throw explicitToolChoiceError(profile.provider);
}

function toolChoiceMatchesDeclaration(
	choice: Exclude<ResponseToolChoice, string>,
	declaration: ToolDeclarationPlan,
): boolean {
	const tool = declaration.tool;
	switch (choice.type) {
		case "function":
		case "custom":
			return "name" in tool && tool.name === choice.name;
		case "mcp":
			return tool.type === "mcp" && tool.server_label === choice.server_label;
		case "shell":
		case "apply_patch":
			return tool.type === choice.type;
		default:
			return tool.type === choice.type;
	}
}

function explicitToolChoiceError(provider: string): BridgeError {
	return new BridgeError(
		BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
		`Explicit tool_choice cannot be satisfied by provider ${provider}.`,
		{
			provider,
			model: "unknown",
			parameter: "tool_choice",
		},
	);
}
