import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ResponseIncompleteDetails,
	ResponseObject,
	ResponseStatus,
	ResponseUsage,
} from "../../../protocol/openai/responses";
import type { ResponseError } from "../../../protocol/openai/shared";
import { responseRequestEchoFields } from "../../response-utils";

export type TerminalResponseStatus = Extract<
	ResponseStatus,
	"completed" | "incomplete" | "failed"
>;

export interface ResponseStatusFields {
	status: TerminalResponseStatus;
	error?: ResponseError | null;
	incomplete_details?: ResponseIncompleteDetails | null;
}

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
