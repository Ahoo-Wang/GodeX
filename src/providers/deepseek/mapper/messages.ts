import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type { ChatMessageMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type { DeepSeekMessage } from "../protocol/completions";

export class DeepSeekMessageMapper implements ChatMessageMapper<DeepSeekMessage> {
	map(ctx: ResponsesContext, _plan: CompatibilityPlan): DeepSeekMessage[] {
		if (typeof ctx.request.input === "string") {
			return [{ role: "user", content: ctx.request.input }];
		}
		return [];
	}
}
