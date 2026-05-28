import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ResponseFormatTextConfig,
	ResponseFormatTextJSONSchemaConfig,
} from "../../../protocol/openai/shared";
import type { CompatibilityPlan } from "./compatibility-plan";

export class OutputFormatContract {
	static empty(): OutputFormatContract {
		return new OutputFormatContract(undefined, undefined);
	}

	static fromRequestFormat(
		format: ResponseFormatTextConfig | undefined,
		plan: CompatibilityPlan,
	): OutputFormatContract {
		if (format?.type !== "json_schema") {
			return new OutputFormatContract(format, undefined);
		}
		const syntheticInstruction =
			plan.responseFormat?.action === "degraded"
				? jsonSchemaInstruction(format)
				: undefined;
		return new OutputFormatContract(format, syntheticInstruction);
	}

	constructor(
		readonly requested: ResponseFormatTextConfig | undefined,
		private readonly instruction: string | undefined,
	) {}

	syntheticInstruction(): string | undefined {
		return this.instruction;
	}
}

export class OutputFormatContractSlot {
	#contract = OutputFormatContract.empty();

	set(contract: OutputFormatContract): void {
		this.#contract = contract;
	}

	current(): OutputFormatContract {
		return this.#contract;
	}
}

export function ensureOutputFormatContractSlot(
	ctx: ResponsesContext,
): OutputFormatContractSlot {
	const partial = ctx as ResponsesContext & {
		outputFormatContract?: OutputFormatContractSlot;
	};
	if (!partial.outputFormatContract) {
		partial.outputFormatContract = new OutputFormatContractSlot();
	}
	return partial.outputFormatContract;
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
