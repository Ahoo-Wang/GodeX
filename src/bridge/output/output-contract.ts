import type {
	ResponseFormatTextConfig,
	ResponseFormatTextJSONSchemaConfig,
} from "../../protocol/openai/shared";

export interface OutputContractResponseFormatDecision {
	readonly action: "supported" | "degraded" | "ignored" | "rejected";
	readonly effectiveValue?: unknown;
	readonly reason?: string;
}

export interface OutputContractPlan {
	readonly requested: ResponseFormatTextConfig | undefined;
	readonly providerResponseFormat?: unknown;
	readonly syntheticInstruction?: string;
	readonly requiresValidJson: boolean;
}

export function planOutputContract(input: {
	readonly format: ResponseFormatTextConfig | undefined;
	readonly responseFormatDecision?: OutputContractResponseFormatDecision;
}): OutputContractPlan {
	if (input.responseFormatDecision?.action === "rejected") {
		return {
			requested: input.format,
			requiresValidJson: false,
		};
	}

	if (input.format?.type !== "json_schema") {
		return {
			requested: input.format,
			providerResponseFormat: input.format,
			requiresValidJson: false,
		};
	}

	if (input.responseFormatDecision?.action !== "degraded") {
		return {
			requested: input.format,
			providerResponseFormat: input.format,
			requiresValidJson: false,
		};
	}

	return {
		requested: input.format,
		providerResponseFormat: { type: "json_object" },
		syntheticInstruction: jsonSchemaInstruction(input.format),
		requiresValidJson: input.format.strict === true,
	};
}

function jsonSchemaInstruction(
	format: ResponseFormatTextJSONSchemaConfig,
): string {
	const lines: string[] = [];
	if (format.name) lines.push(`Schema name: ${format.name}`);
	if (format.description)
		lines.push(`Schema description: ${format.description}`);
	if (lines.length > 0) lines.push("");
	lines.push(
		"Return only valid JSON.",
		"",
		"Rules:",
		"- Output exactly one JSON value and nothing else.",
		"- Do not include markdown, code fences, explanations, or extra text.",
		"- Use the JSON Schema below as formatting guidance. GodeX validates JSON syntax after this json_schema-to-json_object downgrade.",
		"",
		"JSON Schema:",
		JSON.stringify(format.schema),
	);
	return lines.join("\n");
}
