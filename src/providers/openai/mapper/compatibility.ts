import {
	type CompatibilityPlan,
	supportedPlan,
} from "../../../adapter/mapper/chat/compatibility-plan";
import type { CompatibilityNegotiator } from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import { OPENAI_CAPABILITIES } from "./capabilities";

export class OpenAICompatibilityNegotiator implements CompatibilityNegotiator {
	negotiate(_ctx: ResponsesContext): CompatibilityPlan {
		return supportedPlan(OPENAI_CAPABILITIES);
	}
}
