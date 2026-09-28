import type {
	ResponseStreamEvent,
	ResponseUsage,
} from "../../protocol/openai/responses";

export type ProviderStreamFinishReason =
	| "stop"
	| "tool_calls"
	| "length"
	| "model_context_window_exceeded"
	| "content_filter"
	| "sensitive"
	| string;

export interface ProviderStreamError {
	readonly code: string;
	readonly message: string;
}

export interface ProviderStreamToolCallDelta {
	readonly index?: number;
	readonly id?: string;
	readonly type?: "function" | "custom" | string;
	readonly name?: string;
	readonly arguments?: string;
}

export interface ProviderStreamDelta {
	readonly text?: string;
	readonly reasoning?: string;
	readonly refusal?: string;
	readonly toolCall?: ProviderStreamToolCallDelta;
	readonly usage?: ResponseUsage;
	readonly finishReason?: ProviderStreamFinishReason | null;
	readonly error?: ProviderStreamError;
}

export interface MapProviderDeltasToEventsInput {
	readonly machine: {
		readonly phase: string;
		readonly provider?: string;
		readonly model?: string;
		start(): ResponseStreamEvent[];
		text(delta: string): ResponseStreamEvent[];
		reasoning(delta: string): ResponseStreamEvent[];
		refusal(delta: string): ResponseStreamEvent[];
		toolCall(delta: ProviderStreamToolCallDelta): ResponseStreamEvent[];
		usage(usage: ResponseUsage): ResponseStreamEvent[];
		finish(
			finishReason: ProviderStreamFinishReason | null | undefined,
		): ResponseStreamEvent[];
		deferFinish?(
			finishReason: ProviderStreamFinishReason | null | undefined,
		): ResponseStreamEvent[];
		fail(error: ProviderStreamError): ResponseStreamEvent[];
	};
	readonly deltas: readonly unknown[];
	readonly deferTerminal?: boolean;
}
