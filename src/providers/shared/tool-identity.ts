import type { ResponseTool } from "../../protocol/openai/responses";

export type ToolIdentity =
	| { type: "function"; providerName: string; name: string }
	| { type: "local_shell"; providerName: string }
	| { type: "shell"; providerName: string }
	| { type: "apply_patch"; providerName: string }
	| {
			type: "tool_search";
			providerName: string;
			execution?: "server" | "client";
	  }
	| { type: "custom"; providerName: string; name: string }
	| {
			type: "namespace_function";
			providerName: string;
			namespace: string;
			name: string;
	  }
	| {
			type: "namespace_custom";
			providerName: string;
			namespace: string;
			name: string;
	  };

export interface ToolIdentityIndex {
	readonly byProviderName: ReadonlyMap<string, ToolIdentity>;
}

export interface FlattenedToolNameMatch {
	namespace: string;
	name: string;
}

export function flattenToolName(tool: {
	namespace?: string;
	name: string;
}): string {
	return tool.namespace ? `${tool.namespace}__${tool.name}` : tool.name;
}

export function createToolIdentityIndex(
	tools: ResponseTool[] | undefined,
	encodeName: (name: string) => string = (name) => name,
): ToolIdentityIndex {
	const byProviderName = new Map<string, ToolIdentity>();
	if (!tools) return { byProviderName };

	for (const tool of tools) {
		if (tool.type !== "namespace") continue;
		for (const nestedTool of tool.tools) {
			const providerName = encodeName(
				flattenToolName({ namespace: tool.name, name: nestedTool.name }),
			);
			setIfAbsent(
				byProviderName,
				providerName,
				nestedTool.type === "custom"
					? {
							type: "namespace_custom",
							providerName,
							namespace: tool.name,
							name: nestedTool.name,
						}
					: {
							type: "namespace_function",
							providerName,
							namespace: tool.name,
							name: nestedTool.name,
						},
			);
		}
	}

	for (const tool of tools) {
		switch (tool.type) {
			case "function": {
				const providerName = encodeName(tool.name);
				setIfAbsent(byProviderName, providerName, {
					type: "function",
					providerName,
					name: tool.name,
				});
				break;
			}
			case "local_shell":
			case "shell":
			case "apply_patch": {
				const providerName = encodeName(tool.type);
				setIfAbsent(byProviderName, providerName, {
					type: tool.type,
					providerName,
				});
				break;
			}
			case "tool_search": {
				const providerName = encodeName(tool.type);
				setIfAbsent(byProviderName, providerName, {
					type: "tool_search",
					providerName,
					execution: tool.execution,
				});
				break;
			}
			case "custom": {
				const providerName = encodeName(tool.name);
				setIfAbsent(byProviderName, providerName, {
					type: "custom",
					providerName,
					name: tool.name,
				});
				break;
			}
		}
	}

	return { byProviderName };
}

export function findProviderToolIdentity(
	index: ToolIdentityIndex,
	providerName: string,
): ToolIdentity | null {
	return index.byProviderName.get(providerName) ?? null;
}

export function findFlattenedNamespaceTool(
	tools: ResponseTool[] | undefined,
	providerName: string,
	encodeName: (name: string) => string = (name) => name,
): FlattenedToolNameMatch | null {
	const identity = findProviderToolIdentity(
		createToolIdentityIndex(tools, encodeName),
		providerName,
	);
	if (
		identity?.type === "namespace_function" ||
		identity?.type === "namespace_custom"
	) {
		return { namespace: identity.namespace, name: identity.name };
	}

	return null;
}

function setIfAbsent(
	map: Map<string, ToolIdentity>,
	providerName: string,
	identity: ToolIdentity,
): void {
	if (!map.has(providerName)) map.set(providerName, identity);
}
