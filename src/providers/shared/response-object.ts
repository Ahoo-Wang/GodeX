import { responseRequestEchoFields } from "../../adapter/response-utils";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseUsage,
} from "../../protocol/openai/responses";

export type ResponseStatusFields = Pick<
	ResponseObject,
	"status" | "error" | "incomplete_details"
>;

export interface ResponseObjectParts {
	output?: ResponseObject["output"];
	outputText?: string;
	usage?: ResponseUsage | null;
	completedAt?: number | null;
}

export function buildChatResponseObject(
	ctx: ResponsesContext,
	status: ResponseStatusFields,
	parts: ResponseObjectParts = {},
): ResponseObject {
	return {
		id: ctx.responseId,
		object: "response",
		created_at: ctx.createdAt,
		...status,
		model: ctx.resolved.model,
		output: parts.output ?? [],
		...(parts.outputText !== undefined
			? { output_text: parts.outputText }
			: {}),
		...(parts.usage !== undefined ? { usage: parts.usage } : {}),
		...(parts.completedAt !== undefined
			? { completed_at: parts.completedAt }
			: {}),
		...responseRequestEchoFields(ctx),
	};
}
