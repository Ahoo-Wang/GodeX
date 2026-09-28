import type {
	ResponseItem,
	ResponseObject,
	ResponseOutputMessage,
} from "../../protocol/openai/responses";
import { validateOutputContract } from "./output-validator";

export function validateResponseOutputContract(input: {
	readonly requiresValidJson: boolean;
	readonly response: ResponseObject;
	readonly provider: string;
	readonly model: string;
}): void {
	const { response } = input;
	const outputText = extractResponseOutputText(response);
	validateOutputContract({
		requiresValidJson: input.requiresValidJson,
		outputText,
		provider: input.provider,
		model: input.model,
		responseId: response.id,
	});
}

function extractResponseOutputText(response: ResponseObject): string {
	if (typeof response.output_text === "string") return response.output_text;
	return response.output.map(extractItemOutputText).join("");
}

function extractItemOutputText(item: ResponseItem): string {
	if (!isOutputMessage(item)) return "";
	return item.content
		.filter((content) => content.type === "output_text")
		.map((content) => content.text)
		.join("");
}

function isOutputMessage(item: ResponseItem): item is ResponseOutputMessage {
	return (
		item.type === "message" &&
		"role" in item &&
		item.role === "assistant" &&
		"content" in item &&
		Array.isArray(item.content)
	);
}
