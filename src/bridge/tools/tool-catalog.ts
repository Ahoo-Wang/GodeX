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
			name: `${tool.name}__${nested.name}`,
			tool: {
				...nested,
				name: `${tool.name}__${nested.name}`,
			} as ResponseTool,
		}));
	});
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
