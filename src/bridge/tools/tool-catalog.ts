import type { ResponseTool } from "../../protocol/openai/responses";

export interface ToolCatalogEntry {
	readonly type: string;
	readonly name: string;
	readonly tool: ResponseTool;
}

export function buildToolCatalog(
	tools: readonly ResponseTool[] | undefined,
): ToolCatalogEntry[] {
	return (tools ?? []).flatMap((tool, index): ToolCatalogEntry[] => {
		if (tool.type !== "namespace") {
			return [{ type: tool.type, name: toolName(tool, index), tool }];
		}
		return tool.tools.map((nested) => ({
			type: nested.type,
			name: flattenToolName({ namespace: tool.name, name: nested.name }),
			tool: {
				...nested,
				name: flattenToolName({ namespace: tool.name, name: nested.name }),
			} as ResponseTool,
		}));
	});
}

export function flattenToolName(tool: {
	readonly namespace?: string;
	readonly name: string;
}): string {
	return tool.namespace ? `${tool.namespace}__${tool.name}` : tool.name;
}

function toolName(tool: ResponseTool, index: number): string {
	if ((tool.type === "function" || tool.type === "custom") && tool.name) {
		return tool.name;
	}
	if (
		tool.type === "local_shell" ||
		tool.type === "shell" ||
		tool.type === "apply_patch"
	) {
		return tool.type;
	}
	return `${tool.type}_${index}`;
}
