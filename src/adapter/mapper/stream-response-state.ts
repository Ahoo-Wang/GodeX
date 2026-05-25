import type { ResponsesContext } from "../../context/responses-context";
import {
	ADAPTER_STREAM_ALREADY_INITIALIZED,
	ADAPTER_STREAM_INVALID_TRANSITION,
	ADAPTER_STREAM_NOT_INITIALIZED,
	AdapterError,
} from "../../error";
import type {
	ResponseItem,
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import type { ResponseError } from "../../protocol/openai/shared";
import { responseRequestEchoFields } from "../response-utils";

export enum StreamResponsePhase {
	IDLE = "idle",
	IN_PROGRESS = "in_progress",
	COMPLETED = "completed",
	INCOMPLETE = "incomplete",
	FAILED = "failed",
}

export interface FunctionCallDelta {
	index?: number;
	id?: string;
	name?: string;
	arguments?: string;
}

export interface ToolCallSnapshot {
	index: number;
	id: string;
	name: string;
	arguments: string;
}

export type ToolCallOutputItemMapper = (call: ToolCallSnapshot) => ResponseItem;

export type StreamResponseTerminalStatus = Pick<
	ResponseObject,
	"status" | "error" | "incomplete_details"
> & {
	status: "completed" | "incomplete" | "failed";
};

export interface StreamResponseStateOptions {
	toolCallOutputItemMapper: ToolCallOutputItemMapper;
	nowSeconds?: () => number;
}

export class StreamResponseState {
	static readonly KEY = "stream-response-state";

	readonly ctx: ResponsesContext;
	readonly options: Required<StreamResponseStateOptions>;
	private currentPhase = StreamResponsePhase.IDLE;
	private currentSnapshot: ResponseObject;

	private constructor(
		ctx: ResponsesContext,
		options: StreamResponseStateOptions,
	) {
		this.ctx = ctx;
		this.options = {
			...options,
			nowSeconds: options.nowSeconds ?? (() => Math.floor(Date.now() / 1000)),
		};
		this.currentSnapshot = this.baseSnapshot("queued");
	}

	get phase(): StreamResponsePhase {
		return this.currentPhase;
	}

	get snapshot(): ResponseObject {
		return this.currentSnapshot;
	}

	static create(
		ctx: ResponsesContext,
		options: StreamResponseStateOptions,
	): StreamResponseState {
		if (ctx.attributes.has(StreamResponseState.KEY)) {
			throw streamStateError(
				ctx,
				ADAPTER_STREAM_ALREADY_INITIALIZED,
				"StreamResponseState has already been created for this request.",
			);
		}
		const state = new StreamResponseState(ctx, options);
		ctx.attributes.set(StreamResponseState.KEY, state);
		return state;
	}

	static get(ctx: ResponsesContext): StreamResponseState | undefined {
		return ctx.attributes.get(StreamResponseState.KEY) as
			| StreamResponseState
			| undefined;
	}

	static from(ctx: ResponsesContext): StreamResponseState {
		const state = StreamResponseState.get(ctx);
		if (!state) {
			throw streamStateError(
				ctx,
				ADAPTER_STREAM_NOT_INITIALIZED,
				"StreamResponseState has not been created for this request.",
			);
		}
		return state;
	}

	start(): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IDLE, "start");
		this.currentPhase = StreamResponsePhase.IN_PROGRESS;
		this.currentSnapshot = this.baseSnapshot("in_progress");
		return [
			{ type: "response.created", response: this.currentSnapshot },
			{ type: "response.in_progress", response: this.currentSnapshot },
		];
	}

	onTextDelta(_delta: string): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onTextDelta");
		return [];
	}

	onTextDone(): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onTextDone");
		return [];
	}

	onReasoningTextDelta(_delta: string): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onReasoningTextDelta");
		return [];
	}

	onReasoningTextDone(): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onReasoningTextDone");
		return [];
	}

	onRefusalDelta(_delta: string): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onRefusalDelta");
		return [];
	}

	onRefusalDone(): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onRefusalDone");
		return [];
	}

	onFunctionCallDelta(_delta: FunctionCallDelta): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onFunctionCallDelta");
		return [];
	}

	onFunctionCallDone(_index: number): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onFunctionCallDone");
		return [];
	}

	onFinish(status: StreamResponseTerminalStatus): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onFinish");
		this.currentPhase = terminalPhase(status.status);
		this.currentSnapshot = {
			...this.currentSnapshot,
			...status,
			completed_at: this.options.nowSeconds(),
		};
		return [
			{ type: terminalEventType(status.status), response: this.snapshot },
		];
	}

	onError(error: ResponseError): ResponseStreamEvent[] {
		return this.onFinish({ status: "failed", error });
	}

	private baseSnapshot(status: ResponseObject["status"]): ResponseObject {
		return {
			id: this.ctx.responseId,
			object: "response",
			created_at: this.ctx.createdAt,
			status,
			model: this.ctx.resolved.model,
			output: [],
			...responseRequestEchoFields(this.ctx),
		};
	}

	private assertPhase(expected: StreamResponsePhase, action: string): void {
		if (this.currentPhase !== expected) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_INVALID_TRANSITION,
				`${action} cannot run while stream response phase is ${this.currentPhase}.`,
				{ action, phase: this.currentPhase },
			);
		}
	}
}

export function streamStateError(
	ctx: ResponsesContext,
	code: string,
	message: string,
	context: Record<string, unknown> = {},
): AdapterError {
	return new AdapterError(code, message, {
		provider: ctx.resolved.provider,
		model: ctx.resolved.model,
		...context,
	});
}

function terminalPhase(
	status: StreamResponseTerminalStatus["status"],
): StreamResponsePhase {
	switch (status) {
		case "completed":
			return StreamResponsePhase.COMPLETED;
		case "incomplete":
			return StreamResponsePhase.INCOMPLETE;
		case "failed":
			return StreamResponsePhase.FAILED;
		default:
			throw new Error(`Unknown terminal status: ${status}`);
	}
}

function terminalEventType(
	status: StreamResponseTerminalStatus["status"],
): ResponseStreamEvent["type"] {
	switch (status) {
		case "completed":
			return "response.completed";
		case "incomplete":
			return "response.incomplete";
		case "failed":
			return "response.failed";
		default:
			throw new Error(`Unknown terminal status: ${status}`);
	}
}
