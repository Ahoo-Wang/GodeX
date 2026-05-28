import type { ResponseFormatTextJSONSchemaConfig } from "../../protocol/openai/shared";

export function jsonSchemaOutputContractMessage(
	format: ResponseFormatTextJSONSchemaConfig,
): string {
	const lines: string[] = [];
	if (format.name) lines.push(`Schema name: ${format.name}`);
	if (format.description)
		lines.push(`Schema description: ${format.description}`);
	if (lines.length > 0) lines.push("");
	lines.push(
		"Return only JSON that conforms to the JSON Schema below.",
		"",
		"Rules:",
		"- Output exactly one JSON value and nothing else.",
		"- Do not include markdown, code fences, explanations, or extra text.",
		"- Include all required properties.",
		"- Respect property types, enum/const values, numeric/string constraints, and additionalProperties.",
		"- Use null only when the schema explicitly allows null.",
		"",
		"JSON Schema:",
		JSON.stringify(format.schema),
	);
	return lines.join("\n");
}
