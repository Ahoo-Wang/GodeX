import { type OutputContractPlan, planOutputContract } from "../bridge/output";
import type { ResponsesContext } from "../context/responses-context";

export class OutputContractSlot {
	#plan = planOutputContract({ format: undefined });

	set(plan: OutputContractPlan): void {
		this.#plan = plan;
	}

	current(): OutputContractPlan {
		return this.#plan;
	}
}

export function ensureOutputContractSlot(
	ctx: ResponsesContext,
): OutputContractSlot {
	const partial = ctx as ResponsesContext & {
		outputContract?: OutputContractSlot;
	};
	if (!partial.outputContract) {
		partial.outputContract = new OutputContractSlot();
	}
	return partial.outputContract;
}
