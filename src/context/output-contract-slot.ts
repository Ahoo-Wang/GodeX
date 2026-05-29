import { type OutputContractPlan, planOutputContract } from "../bridge/output";

export class OutputContractSlot {
	#plan = planOutputContract({ format: undefined });

	set(plan: OutputContractPlan): void {
		this.#plan = plan;
	}

	current(): OutputContractPlan {
		return this.#plan;
	}
}
