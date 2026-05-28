import {
	type OutputContractPlan,
	planOutputContract,
} from "../../../bridge/output/output-contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseFormatTextConfig } from "../../../protocol/openai/shared";
import type { CompatibilityPlan } from "./compatibility-plan";

export class OutputFormatContract {
	static empty(): OutputFormatContract {
		return new OutputFormatContract(planOutputContract({ format: undefined }));
	}

	static fromRequestFormat(
		format: ResponseFormatTextConfig | undefined,
		plan: CompatibilityPlan,
	): OutputFormatContract {
		return new OutputFormatContract(
			planOutputContract({
				format,
				responseFormatDecision: plan.responseFormat,
			}),
		);
	}

	constructor(private readonly plan: OutputContractPlan) {}

	get requested(): ResponseFormatTextConfig | undefined {
		return this.plan.requested;
	}

	syntheticInstruction(): string | undefined {
		return this.plan.syntheticInstruction;
	}

	requiresValidJson(): boolean {
		return this.plan.requiresValidJson;
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
