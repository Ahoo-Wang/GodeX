import type { ResponseTool } from "../../protocol/openai/responses";

export interface FlattenedToolNameMatch {
	namespace: string;
	name: string;
}

export function findFlattenedNamespaceTool(
	tools: ResponseTool[] | undefined,
	providerName: string,
	encodeName: (name: string) => string = (name) => name,
): FlattenedToolNameMatch | null {
	if (!tools) return null;

	for (const tool of tools) {
		if (tool.type !== "namespace") continue;
		for (const nestedTool of tool.tools) {
			const flattenedName = `${tool.name}__${nestedTool.name}`;
			if (providerName === encodeName(flattenedName)) {
				return { namespace: tool.name, name: nestedTool.name };
			}
		}
	}

	return null;
}
