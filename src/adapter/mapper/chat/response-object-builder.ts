import type { ResponseObject } from "../../../protocol/openai/responses";

export type ResponseStatusFields = Pick<
	ResponseObject,
	"status" | "error" | "incomplete_details"
>;
