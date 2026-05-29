import {
	BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
	createBridgeFailure,
} from "../../error";

export function validateOutputContract(input: {
	readonly requiresValidJson: boolean;
	readonly outputText: string;
	readonly provider: string;
	readonly model: string;
	readonly responseId: string;
}): void {
	if (!input.requiresValidJson) return;

	try {
		JSON.parse(input.outputText);
	} catch (cause) {
		throw createBridgeFailure(
			BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
			"Response output is not valid JSON for strict downgraded json_schema.",
			{
				provider: input.provider,
				model: input.model,
				response_id: input.responseId,
			},
			{ cause: cause instanceof Error ? cause : undefined },
		);
	}
}
