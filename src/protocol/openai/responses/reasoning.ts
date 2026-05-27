import type { ItemStatus } from "../shared";

export interface SummaryTextContent {
	type: "summary_text";
	text: string;
}

export interface ReasoningTextContent {
	type: "reasoning_text";
	text: string;
}

export interface Reasoning {
	id: string;
	type: "reasoning";
	summary: SummaryTextContent[];
	content?: ReasoningTextContent[];
	encrypted_content?: string;
	status?: ItemStatus;
}

export interface Compaction {
	id?: string;
	type: "compaction";
	encrypted_content: string;
}
