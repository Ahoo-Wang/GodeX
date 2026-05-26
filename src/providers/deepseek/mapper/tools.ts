import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatToolChoiceMapper,
	ChatToolMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type { DeepSeekTool, DeepSeekToolChoice } from "../protocol/completions";

export class DeepSeekToolMapper implements ChatToolMapper<DeepSeekTool[]> {
	map(
		_ctx: ResponsesContext,
		_plan: CompatibilityPlan,
	): DeepSeekTool[] | undefined {
		return undefined;
	}
}

export class DeepSeekToolChoiceMapper
	implements ChatToolChoiceMapper<DeepSeekTool[], DeepSeekToolChoice>
{
	map(
		_ctx: ResponsesContext,
		_plan: CompatibilityPlan,
		_tools: DeepSeekTool[] | undefined,
	): DeepSeekToolChoice | undefined {
		return undefined;
	}
}
