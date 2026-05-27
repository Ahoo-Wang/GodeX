import type { ItemStatus, Phase, Role } from "../shared";
import type {
	ResponseInputMessageContentList,
	ResponseOutputContent,
} from "./content";

export interface EasyInputMessage {
	content: string | ResponseInputMessageContentList;
	role: Role;
	phase?: Phase;
	type?: "message";
}

export interface ResponseInputMessage {
	content: ResponseInputMessageContentList;
	role: "user" | "system" | "developer";
	status?: ItemStatus;
	type?: "message";
}

export type InputItemBase = EasyInputMessage | ResponseInputMessage;

/** Convenience: a text string or a list of input items. */
export type InputItem = string | InputItemBase;

export interface ResponseOutputMessage {
	id: string;
	type: "message";
	role: "assistant";
	content: ResponseOutputContent[];
	status: ItemStatus;
	phase?: Phase;
}
