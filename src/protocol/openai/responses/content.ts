import type { ImageDetail, TokenLogprobItem } from "../shared";

export interface ResponseInputText {
	type: "input_text";
	text: string;
}

export interface ResponseInputImage {
	type: "input_image";
	detail?: ImageDetail;
	file_id?: string;
	image_url?: string;
}

export interface ResponseInputFile {
	type: "input_file";
	detail?: "low" | "high";
	file_data?: string;
	file_id?: string;
	file_url?: string;
	filename?: string;
}

export type ResponseInputContent =
	| ResponseInputText
	| ResponseInputImage
	| ResponseInputFile;

export type ResponseInputMessageContentList = ResponseInputContent[];

export interface ResponseOutputText {
	type: "output_text";
	text: string;
	annotations?: ResponseAnnotation[];
	logprobs?: ResponseTokenLogprob[];
}

export interface ResponseOutputRefusal {
	type: "refusal";
	refusal: string;
}

export type ResponseOutputContent = ResponseOutputText | ResponseOutputRefusal;

export interface ResponseTokenLogprob {
	token: string;
	bytes: number[] | null;
	logprob: number;
	top_logprobs: TokenLogprobItem[];
}

export interface FileCitation {
	type: "file_citation";
	file_id: string;
	filename: string;
	index: number;
}

export interface URLCitation {
	type: "url_citation";
	start_index: number;
	end_index: number;
	title: string;
	url: string;
}

export interface ContainerFileCitation {
	type: "container_file_citation";
	container_id: string;
	end_index: number;
	file_id: string;
	filename: string;
	start_index: number;
}

export interface FilePath {
	type: "file_path";
	file_id: string;
	index: number;
}

export type ResponseAnnotation =
	| FileCitation
	| URLCitation
	| ContainerFileCitation
	| FilePath;
