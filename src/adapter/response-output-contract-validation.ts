import { validateResponseOutputContract as validateBridgeResponseOutputContract } from "../bridge/output/validator";
import type { ResponsesContext } from "../context/responses-context";
import { ADAPTER_RESPONSE_INVALID_OUTPUT_FORMAT, AdapterError } from "../error";
import type { ResponseObject } from "../protocol/openai/responses";
import type { OutputFormatContract } from "./mapper/chat/output-format-contract";

export function invalidOutputFormatMessage(err: unknown): string {
	if (err instanceof AdapterError) {
		return `${err.code}: ${err.message}`;
	}
	return String(err);
}

export function validateResponseOutputContract(
	ctx: ResponsesContext,
	contract: OutputFormatContract,
	response: ResponseObject,
): void {
	try {
		validateBridgeResponseOutputContract({
			requiresValidJson: contract.requiresValidJson(),
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
	const maybeCtx = ctx as ResponsesContext & {
		addDiagnostic?: ResponsesContext["addDiagnostic"];
	};
	if (typeof maybeCtx.addDiagnostic !== "function") return;
	maybeCtx.addDiagnostic({
		code: ADAPTER_RESPONSE_INVALID_OUTPUT_FORMAT,
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
