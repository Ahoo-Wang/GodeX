import type { OutputContractPlan } from "../bridge/output";
import { validateResponseOutputContract as validateBridgeResponseOutputContract } from "../bridge/output/validator";
import type { ResponsesContext } from "../context/responses-context";
import { BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT, BridgeError } from "../error";
import type { ResponseObject } from "../protocol/openai/responses";

export function invalidOutputFormatMessage(err: unknown): string {
	if (err instanceof BridgeError) {
		return `${err.code}: ${err.message}`;
	}
	return String(err);
}

export function validateResponseOutputContract(
	ctx: ResponsesContext,
	contract: OutputContractPlan,
	response: ResponseObject,
): void {
	try {
		validateBridgeResponseOutputContract({
			requiresValidJson: contract.requiresValidJson,
			response,
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
		});
	} catch (err) {
		addInvalidOutputDiagnostic(ctx, response.id);
		throw err;
	}
}

function addInvalidOutputDiagnostic(
	ctx: ResponsesContext,
	responseId: string,
): void {
	ctx.addDiagnostic({
		code: BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
		severity: "error",
		path: "response.output_text",
		action: "rejected",
		message:
			"Response output is not valid JSON for strict downgraded json_schema.",
		metadata: {
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			response_id: responseId,
		},
	});
}
