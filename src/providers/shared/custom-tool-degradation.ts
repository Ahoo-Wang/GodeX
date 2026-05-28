import type { CustomToolInputFormat } from "../../protocol/openai/shared";

interface CustomToolContractSource {
	description?: string;
	format?: CustomToolInputFormat;
}

const DEFAULT_CUSTOM_TOOL_DESCRIPTION =
	"Call this custom tool with a string input when it best matches the user request.";

export function degradedCustomToolDescription(
	tool: CustomToolContractSource,
	fallbackDescription = DEFAULT_CUSTOM_TOOL_DESCRIPTION,
): string {
	return joinDescription([
		tool.description ?? fallbackDescription,
		"This Responses custom tool is degraded to a function tool. Put the complete custom tool input in the required input string.",
		customToolFormatDescription(tool.format),
	]);
}

export function degradedCustomToolParameters(
	tool: CustomToolContractSource,
): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			input: {
				type: "string",
				description: joinDescription([
					"Complete input for the custom tool.",
					customToolFormatDescription(tool.format),
				]),
			},
		},
		required: ["input"],
	};
}

function customToolFormatDescription(
	format: CustomToolInputFormat | undefined,
): string | undefined {
	if (!format) return undefined;
	if (format.type === "text") return "Input format: text.";
	return `Input format: grammar (${format.syntax}). Grammar definition:\n${format.definition}`;
}

function joinDescription(parts: Array<string | undefined>): string {
	return parts.filter((part): part is string => Boolean(part)).join("\n\n");
}
