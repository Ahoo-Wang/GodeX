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
	readonly jsonSchemaInstruction?: string;
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
		jsonSchemaInstruction: buildJsonSchemaInstruction(input.format),
		requiresValidJson: input.format.strict === true,
	};
}

function buildJsonSchemaInstruction(
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
		"- Use the JSON Schema below as formatting guidance.",
		"",
		"JSON Schema:",
		JSON.stringify(format.schema),
	);
	if (format.strict === true) {
		lines.push(
			"",
			"Final output format override: return exactly one valid JSON object matching the requested schema. This overrides any prior request for plain text, markdown, or extra text.",
		);
	}
	return lines.join("\n");
}
