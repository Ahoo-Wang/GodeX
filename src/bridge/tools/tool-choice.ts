import type { ResponseToolChoice } from "../../protocol/openai/responses";

export type ToolChoiceMode = "auto" | "none" | "required";

export function isToolChoiceMode(
	toolChoice: ResponseToolChoice,
): toolChoice is ToolChoiceMode {
	return (
		toolChoice === "auto" || toolChoice === "none" || toolChoice === "required"
	);
}

export function requestedToolChoiceType(
	toolChoice: Exclude<ResponseToolChoice, string>,
): string {
	return toolChoice.type;
}

export function renderProviderToolChoice(input: {
	readonly requested: Exclude<ResponseToolChoice, string>;
	readonly providerType: string;
	readonly providerName?: string;
}): ResponseToolChoice {
	if (input.providerType === "function" && input.providerName) {
		return { type: "function", name: input.providerName };
	}
	if (input.providerType === input.requested.type) {
		return input.requested;
	}
	return { type: input.providerType } as ResponseToolChoice;
}
