import type { ResponseError } from "../shared";
import type { ResponseOutputContent, ResponseTokenLogprob } from "./content";
import type { ResponseItem } from "./items";
import type { ResponseObject } from "./object";
import type { ReasoningTextContent, SummaryTextContent } from "./reasoning";

export type ResponseStreamEventType =
	| "response.created"
	| "response.in_progress"
	| "response.completed"
	| "response.failed"
	| "response.incomplete"
	| "response.cancelled"
	| "response.queued"
	| "response.output_item.added"
	| "response.output_item.done"
	| "response.content_part.added"
	| "response.content_part.done"
	| "response.reasoning_summary_part.added"
	| "response.reasoning_summary_part.done"
	| "response.reasoning_text_part.added"
	| "response.reasoning_text_part.done"
	| "response.output_text.delta"
	| "response.output_text.done"
	| "response.refusal.delta"
	| "response.refusal.done"
	| "response.reasoning_summary_text.delta"
	| "response.reasoning_summary_text.done"
	| "response.reasoning_text.delta"
	| "response.reasoning_text.done"
	| "response.logprobs.added"
	| "response.logprobs.done"
	| "response.web_search_call.in_progress"
	| "response.web_search_call.searching"
	| "response.web_search_call.completed"
	| "response.web_search_call.failed"
	| "response.file_search_call.in_progress"
	| "response.file_search_call.searching"
	| "response.file_search_call.completed"
	| "response.file_search_call.failed"
	| "response.function_call_arguments.delta"
	| "response.function_call_arguments.done"
	| "response.code_interpreter_call.in_progress"
	| "response.code_interpreter_call.interpreting"
	| "response.code_interpreter_call.completed"
	| "response.code_interpreter_call.failed"
	| "response.image_generation_call.result.delta"
	| "response.image_generation_call.image_url.delta"
	| "response.image_generation_call.done"
	| "response.computer_call.in_progress"
	| "response.computer_call.completed";

export interface ResponseStreamEvent {
	type: ResponseStreamEventType;
	sequence_number?: number;
	response?: ResponseObject;
	item?: ResponseItem;
	item_id?: string;
	part?: ResponseOutputContent | ReasoningTextContent | SummaryTextContent;
	content_index?: number;
	output_index?: number;
	delta?: string;
	text?: string;
	refusal?: string;
	logprobs?: ResponseTokenLogprob[];
	error?: ResponseError | null;
}
