import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseObject } from "../../protocol/openai/responses";

export enum StreamPhase {
	HEADERS,
	CONTENT,
	DONE,
}

export interface ToolCallAccumulator {
	index: number;
	id: string;
	name: string;
	arguments: string;
}

export interface StatusFields {
	status: ResponseObject["status"];
	error?: ResponseObject["error"];
	incomplete_details?: ResponseObject["incomplete_details"];
}

export class StreamState {
	static readonly KEY = "stream-state";

	phase = StreamPhase.HEADERS;
	outputText = "";
	reasoningContent = "";
	refusal = "";
	toolCalls: ToolCallAccumulator[] = [];
	completedAt: number | null = null;
	finalStatus: StatusFields = { status: "in_progress" };

	static from<T extends StreamState>(
		this: new () => T,
		ctx: ResponsesContext,
	): T {
		const key = StreamState.KEY;
		let state = ctx.attributes.get(key) as T | undefined;
		if (!state) {
			state = new this();
			ctx.attributes.set(key, state);
		}
		return state;
	}
}
