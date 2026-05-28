import type { CompatibilityDiagnostic } from "../../adapter/compatibility";
import type { ResponsesContext } from "../../context/responses-context";
import {
	ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
	AdapterError,
} from "../../error";
import type {
	ResponseTool,
	ResponseToolChoice,
} from "../../protocol/openai/responses";
import type {
	CompatibilityDecision,
	CompatibilityPlan,
} from "../compatibility";
import type { BridgeDialectProfile } from "../dialect";
import { buildToolCatalog, type ToolCatalogEntry } from "./tool-catalog";
import {
	isToolChoiceMode,
	renderProviderToolChoice,
	requestedToolChoiceType,
} from "./tool-choice";
import { defaultToolNameCodec } from "./tool-identity";

export interface PlanBridgeToolsOptions {
	readonly tools?: ResponseTool[];
	readonly toolChoice?: ResponseToolChoice;
	readonly profile: BridgeDialectProfile;
}

export interface ToolPlanningProfile {
	readonly provider: string;
	readonly nativeToolTypes: ReadonlySet<string>;
	readonly degradedToolTypes: ReadonlyMap<string, string>;
	readonly toolChoice: ReadonlySet<string>;
	readonly maxTools?: number;
	readonly toProviderName?: (name: string) => string;
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
	throw new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
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

function explicitToolChoiceError(provider: string): AdapterError {
	return new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
		`Explicit tool_choice cannot be satisfied by provider ${provider}.`,
		{
			provider,
			model: "unknown",
			parameter: "tool_choice",
		},
	);
}

export type BridgeToolPlanAction = "supported" | "degraded";
export type BridgeToolChoicePlanAction =
	| BridgeToolPlanAction
	| "ignored"
	| "rejected";

export interface BridgeToolPlanEntry {
	readonly tool: ResponseTool;
	readonly requestedType: string;
	readonly effectiveType: string;
	readonly action: BridgeToolPlanAction;
}

export interface BridgeToolChoicePlan {
	readonly requestedValue: ResponseToolChoice | undefined;
	readonly requestedType?: string;
	readonly effectiveType?: string;
	readonly effectiveValue?: ResponseToolChoice;
	readonly action: BridgeToolChoicePlanAction;
	readonly reason?: string;
}

export interface BridgeToolPlan {
	readonly enabled: boolean;
	readonly entries: BridgeToolPlanEntry[];
	readonly toolChoice?: BridgeToolChoicePlan;
	readonly diagnostics: CompatibilityDiagnostic[];
}

export function planBridgeTools({
	tools,
	toolChoice,
	profile,
}: PlanBridgeToolsOptions): BridgeToolPlan {
	const diagnostics: CompatibilityDiagnostic[] = [];
	if (toolChoice === "none") {
		return {
			enabled: false,
			entries: [],
			toolChoice: {
				requestedValue: toolChoice,
				requestedType: "none",
				effectiveType: "none",
				effectiveValue: "none",
				action: "supported",
			},
			diagnostics,
		};
	}

	const entries = (tools ?? []).flatMap((tool) =>
		planToolEntry(tool, profile, diagnostics),
	);
	return {
		enabled: entries.length > 0,
		entries,
		toolChoice: planToolChoice(toolChoice, entries, profile, diagnostics),
		diagnostics,
	};
}

export function recordBridgeToolPlan(
	ctx: ResponsesContext,
	compatibilityPlan: CompatibilityPlan,
	toolPlan: BridgeToolPlan,
): void {
	for (const diagnostic of toolPlan.diagnostics) {
		ctx.addDiagnostic(diagnostic);
		compatibilityPlan.diagnostics.push(diagnostic);
	}
	for (const entry of toolPlan.entries) {
		compatibilityPlan.tools.set(entry.requestedType, {
			action: entry.action,
			effectiveValue: { type: entry.effectiveType },
		});
	}
	if (toolPlan.toolChoice) {
		compatibilityPlan.toolChoice = toCompatibilityDecision(toolPlan.toolChoice);
	}
}

function planToolEntry(
	tool: ResponseTool,
	profile: BridgeDialectProfile,
	diagnostics: CompatibilityDiagnostic[],
): BridgeToolPlanEntry[] {
	const requestedType = tool.type;
	if (profile.tools.native.has(requestedType)) {
		return [
			{
				tool,
				requestedType,
				effectiveType: requestedType,
				action: "supported",
			},
		];
	}

	const effectiveType = profile.tools.degraded.get(requestedType);
	if (effectiveType) {
		diagnostics.push({
			code: "adapter.tool.degraded",
			severity: "warn",
			path: `tools[type=${requestedType}]`,
			action: "degraded",
			message: `${profile.provider} maps Responses tool '${requestedType}' to ${effectiveType}; provider-native semantics may not be enforced.`,
			metadata: {
				provider: profile.provider,
				toolType: requestedType,
				effectiveToolType: effectiveType,
			},
		});
		return [
			{
				tool,
				requestedType,
				effectiveType,
				action: "degraded",
			},
		];
	}

	diagnostics.push({
		code: "adapter.tool.unsupported",
		severity: "warn",
		path: `tools[type=${requestedType}]`,
		action: "ignored",
		message: `${profile.provider} does not support Responses tool '${requestedType}'; skipping declaration.`,
		metadata: { provider: profile.provider, toolType: requestedType },
	});
	return [];
}

function planToolChoice(
	toolChoice: ResponseToolChoice | undefined,
	entries: BridgeToolPlanEntry[],
	profile: BridgeDialectProfile,
	diagnostics: CompatibilityDiagnostic[],
): BridgeToolChoicePlan | undefined {
	if (toolChoice === undefined) return undefined;
	if (typeof toolChoice === "string") {
		return planModeToolChoice(toolChoice, profile, diagnostics);
	}

	const requestedType = toolChoice.type;
	const selectedEntry = entries.find((entry) =>
		toolChoiceMatchesEntry(toolChoice, entry),
	);
	if (!selectedEntry) {
		const reason = `Selected Responses tool_choice '${requestedType}' cannot be declared for ${profile.provider}.`;
		diagnostics.push(
			toolChoiceDiagnostic(profile, "error", "rejected", reason),
		);
		return {
			requestedValue: toolChoice,
			requestedType,
			action: "rejected",
			reason,
		};
	}

	if (profile.toolChoice.supported.has(selectedEntry.effectiveType)) {
		const effectiveValue = effectiveObjectToolChoice(toolChoice, selectedEntry);
		if (selectedEntry.effectiveType !== requestedType) {
			diagnostics.push(
				toolChoiceDiagnostic(
					profile,
					"warn",
					"degraded",
					`Responses tool_choice '${requestedType}' was downgraded to ${selectedEntry.effectiveType}.`,
				),
			);
		}
		return {
			requestedValue: toolChoice,
			requestedType,
			effectiveType: selectedEntry.effectiveType,
			effectiveValue,
			action:
				selectedEntry.effectiveType === requestedType
					? "supported"
					: "degraded",
			...(selectedEntry.effectiveType === requestedType
				? {}
				: {
						reason: `Responses tool_choice '${requestedType}' was downgraded to ${selectedEntry.effectiveType}.`,
					}),
		};
	}

	if (profile.toolChoice.supported.has("auto")) {
		const reason = `${profile.provider} cannot force Responses tool_choice '${requestedType}'; downgraded to auto.`;
		diagnostics.push(toolChoiceDiagnostic(profile, "warn", "degraded", reason));
		return {
			requestedValue: toolChoice,
			requestedType,
			effectiveType: "auto",
			effectiveValue: "auto",
			action: "degraded",
			reason,
		};
	}

	const reason = `${profile.provider} cannot represent Responses tool_choice '${requestedType}'.`;
	diagnostics.push(toolChoiceDiagnostic(profile, "error", "rejected", reason));
	return {
		requestedValue: toolChoice,
		requestedType,
		action: "rejected",
		reason,
	};
}

function planModeToolChoice(
	toolChoice: "auto" | "none" | "required",
	profile: BridgeDialectProfile,
	diagnostics: CompatibilityDiagnostic[],
): BridgeToolChoicePlan {
	if (profile.toolChoice.supported.has(toolChoice)) {
		return {
			requestedValue: toolChoice,
			requestedType: toolChoice,
			effectiveType: toolChoice,
			effectiveValue: toolChoice,
			action: "supported",
		};
	}
	if (profile.toolChoice.supported.has("auto")) {
		const reason = `${profile.provider} does not support tool_choice '${toolChoice}'; downgraded to auto.`;
		diagnostics.push(toolChoiceDiagnostic(profile, "warn", "degraded", reason));
		return {
			requestedValue: toolChoice,
			requestedType: toolChoice,
			effectiveType: "auto",
			effectiveValue: "auto",
			action: "degraded",
			reason,
		};
	}
	const reason = `${profile.provider} does not support tool_choice '${toolChoice}'.`;
	diagnostics.push(toolChoiceDiagnostic(profile, "error", "rejected", reason));
	return {
		requestedValue: toolChoice,
		requestedType: toolChoice,
		action: "rejected",
		reason,
	};
}

function toolChoiceMatchesEntry(
	choice: Exclude<ResponseToolChoice, string>,
	entry: BridgeToolPlanEntry,
): boolean {
	const tool = entry.tool;
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

function effectiveObjectToolChoice(
	choice: Exclude<ResponseToolChoice, string>,
	entry: BridgeToolPlanEntry,
): ResponseToolChoice {
	if (entry.effectiveType === "function") {
		const name =
			"name" in choice
				? choice.name
				: entry.tool.type === "apply_patch"
					? "apply_patch"
					: entry.tool.type === "shell"
						? "shell"
						: undefined;
		if (name) return { type: "function", name };
	}
	return choice;
}

function toolChoiceDiagnostic(
	profile: BridgeDialectProfile,
	severity: CompatibilityDiagnostic["severity"],
	action: CompatibilityDiagnostic["action"],
	message: string,
): CompatibilityDiagnostic {
	return {
		code: "adapter.param.unsupported",
		severity,
		path: "tool_choice",
		action,
		message,
		metadata: { provider: profile.provider },
	};
}

function toCompatibilityDecision(
	toolChoicePlan: BridgeToolChoicePlan,
): CompatibilityDecision {
	return {
		action: toolChoicePlan.action,
		reason: toolChoicePlan.reason,
		effectiveValue: toolChoicePlan.effectiveValue,
	};
}
