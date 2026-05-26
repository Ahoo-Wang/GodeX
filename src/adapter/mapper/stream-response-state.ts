import type { ResponsesContext } from "../../context/responses-context";
import {
	ADAPTER_STREAM_ALREADY_INITIALIZED,
	ADAPTER_STREAM_DELTA_AFTER_TERMINAL,
	ADAPTER_STREAM_INCOMPLETE_TOOL_CALL,
	ADAPTER_STREAM_INVALID_TRANSITION,
	ADAPTER_STREAM_MISSING_OPTIONS,
	ADAPTER_STREAM_MISSING_OUTPUT_BLOCK,
	ADAPTER_STREAM_NOT_INITIALIZED,
	ADAPTER_STREAM_OUTPUT_BEFORE_START,
	AdapterError,
} from "../../error";
import type {
	ResponseItem,
	ResponseObject,
	ResponseStreamEvent,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { ResponseError } from "../../protocol/openai/shared";
import { responseRequestEchoFields } from "../response-utils";
import {
	contentPart,
	type MessageBlock,
	messageItem,
	type ReasoningBlock,
	reasoningItem,
} from "./stream-response-message";
import { OutputCollectionState } from "./stream-response-output";
import {
	ToolCallOutputState,
	type ToolCallRecord,
} from "./stream-response-tool-call";

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
	deferTerminal?: boolean;
	nowSeconds?: () => number;
}

export class StreamResponseState {
	static readonly KEY = "stream-response-state";

	readonly ctx: ResponsesContext;
	readonly options: Required<StreamResponseStateOptions>;
	private currentPhase = StreamResponsePhase.IDLE;
	private currentSnapshot: ResponseObject;
	private readonly output = new OutputCollectionState();
	private toolCalls!: ToolCallOutputState;
	private activeText?: MessageBlock;
	private activeRefusal?: MessageBlock;
	private activeReasoning?: ReasoningBlock;
	private outputText = "";
	private pendingTerminal?: StreamResponseTerminalStatus;

	private constructor(
		ctx: ResponsesContext,
		options: StreamResponseStateOptions,
	) {
		this.ctx = ctx;
		this.options = {
			deferTerminal: false,
			...options,
			nowSeconds: options.nowSeconds ?? (() => Math.floor(Date.now() / 1000)),
		};
		this.toolCalls = new ToolCallOutputState(
			this.options.toolCallOutputItemMapper,
		);
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
		if (!options?.toolCallOutputItemMapper) {
			throw streamStateError(
				ctx,
				ADAPTER_STREAM_MISSING_OPTIONS,
				"toolCallOutputItemMapper is required.",
			);
		}
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
		this.currentSnapshot = {
			...this.currentSnapshot,
			status: "in_progress",
		};
		return [
			{ type: "response.created", response: this.currentSnapshot },
			{ type: "response.in_progress", response: this.currentSnapshot },
		];
	}

	onTextDelta(delta: string): ResponseStreamEvent[] {
		this.assertActive("onTextDelta");
		if (!delta) return [];
		const events: ResponseStreamEvent[] = [];

		if (!this.activeText) {
			const outputIndex = this.output.items().length;
			const block: MessageBlock = {
				kind: "text",
				outputIndex,
				contentIndex: 0,
				itemId: `msg_${this.ctx.responseId}_${outputIndex}`,
				text: "",
				done: false,
			};

			const item = messageItem(block);
			this.output.add(item);
			this.activeText = block;

			events.push({
				type: "response.output_item.added",
				output_index: outputIndex,
				item,
			});
			events.push({
				type: "response.content_part.added",
				item_id: block.itemId,
				output_index: outputIndex,
				content_index: 0,
				part: contentPart(block),
			});
		}

		this.activeText.text += delta;
		this.outputText += delta;
		this.refreshSnapshot();

		events.push({
			type: "response.output_text.delta",
			item_id: this.activeText.itemId,
			output_index: this.activeText.outputIndex,
			content_index: this.activeText.contentIndex,
			delta,
		});

		return events;
	}

	onTextDone(): ResponseStreamEvent[] {
		this.assertActive("onTextDone");
		if (!this.activeText) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_MISSING_OUTPUT_BLOCK,
				"No active text output block to complete.",
			);
		}
		const events = this.closeActiveText();
		this.refreshSnapshot();
		return events;
	}

	onReasoningTextDelta(delta: string): ResponseStreamEvent[] {
		this.assertActive("onReasoningTextDelta");
		if (!delta) return [];
		const events: ResponseStreamEvent[] = [];

		if (!this.activeReasoning) {
			const outputIndex = this.output.items().length;
			const block: ReasoningBlock = {
				outputIndex,
				contentIndex: 0,
				itemId: `rs_${this.ctx.responseId}_${outputIndex}`,
				text: "",
				done: false,
			};

			const item = reasoningItem(block);
			this.output.add(item);
			this.activeReasoning = block;

			events.push({
				type: "response.output_item.added",
				output_index: outputIndex,
				item,
			});
			events.push({
				type: "response.reasoning_text_part.added",
				item_id: block.itemId,
				output_index: outputIndex,
				content_index: 0,
				part: { type: "reasoning_text", text: "" },
			});
		}

		this.activeReasoning.text += delta;
		this.output.update(
			this.activeReasoning.outputIndex,
			reasoningItem(this.activeReasoning),
		);
		this.refreshSnapshot();

		events.push({
			type: "response.reasoning_text.delta",
			item_id: this.activeReasoning.itemId,
			output_index: this.activeReasoning.outputIndex,
			content_index: this.activeReasoning.contentIndex,
			delta,
		});

		return events;
	}

	onReasoningTextDone(): ResponseStreamEvent[] {
		this.assertActive("onReasoningTextDone");
		if (!this.activeReasoning) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_MISSING_OUTPUT_BLOCK,
				"No active reasoning output block to complete.",
			);
		}
		const events = this.closeActiveReasoning();
		this.refreshSnapshot();
		return events;
	}

	onRefusalDelta(delta: string): ResponseStreamEvent[] {
		this.assertActive("onRefusalDelta");
		if (!delta) return [];
		const events: ResponseStreamEvent[] = [];

		if (!this.activeRefusal) {
			const outputIndex = this.output.items().length;
			const block: MessageBlock = {
				kind: "refusal",
				outputIndex,
				contentIndex: 0,
				itemId: `msg_${this.ctx.responseId}_${outputIndex}`,
				text: "",
				done: false,
			};

			const item = messageItem(block);
			this.output.add(item);
			this.activeRefusal = block;

			events.push({
				type: "response.output_item.added",
				output_index: outputIndex,
				item,
			});
			events.push({
				type: "response.content_part.added",
				item_id: block.itemId,
				output_index: outputIndex,
				content_index: 0,
				part: contentPart(block),
			});
		}

		this.activeRefusal.text += delta;
		this.refreshSnapshot();

		events.push({
			type: "response.refusal.delta",
			item_id: this.activeRefusal.itemId,
			output_index: this.activeRefusal.outputIndex,
			content_index: this.activeRefusal.contentIndex,
			delta,
		});

		return events;
	}

	onRefusalDone(): ResponseStreamEvent[] {
		this.assertActive("onRefusalDone");
		if (!this.activeRefusal) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_MISSING_OUTPUT_BLOCK,
				"No active refusal output block to complete.",
			);
		}
		const events = this.closeActiveRefusal();
		this.refreshSnapshot();
		return events;
	}

	onFunctionCallDelta(delta: FunctionCallDelta): ResponseStreamEvent[] {
		this.assertActive("onFunctionCallDelta");
		const events: ResponseStreamEvent[] = [];

		// Reject deltas for closed calls before mutating accumulator
		const idx = delta.index ?? this.toolCalls.size;
		const existing = this.toolCalls.get(idx);
		if (existing?.done) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_INVALID_TRANSITION,
				`Cannot apply function call delta at index ${idx}: call is already done.`,
			);
		}

		const call = this.toolCalls.apply(delta);

		// If no name yet, accumulate silently (arguments may arrive before name)
		if (!call.name) return [];
		// No-op on empty args when call is already opened
		if (call.opened && !delta.arguments) return [];

		// Open output item if not yet opened
		if (!call.opened) {
			const emptySnapshot = this.toolCalls.snapshot({ ...call, arguments: "" });
			const rawItem = this.toolCalls.item(emptySnapshot);
			const emptyItem = normalizeItemStatus(rawItem, "in_progress");
			const output = this.output.add(emptyItem);
			call.outputIndex = output.index;
			call.opened = true;

			events.push({
				type: "response.output_item.added",
				output_index: output.index,
				item_id: call.id,
				item: emptyItem,
			});

			// If arguments accumulated before name, emit them as one delta
			if (call.arguments) {
				events.push({
					type: "response.function_call_arguments.delta",
					item_id: call.id,
					output_index: output.index,
					delta: call.arguments,
				});
				this.output.update(
					call.outputIndex,
					normalizeItemStatus(this.toolCalls.item(call), "in_progress"),
				);
			}

			this.refreshSnapshot();
			return events;
		}

		// Already opened — emit the new delta only
		const outputIdx = call.outputIndex;
		if (outputIdx === undefined) return events;
		if (delta.arguments) {
			events.push({
				type: "response.function_call_arguments.delta",
				item_id: call.id,
				output_index: outputIdx,
				delta: delta.arguments,
			});
		}

		this.output.update(
			outputIdx,
			normalizeItemStatus(this.toolCalls.item(call), "in_progress"),
		);
		this.refreshSnapshot();
		return events;
	}

	onFunctionCallDone(index: number): ResponseStreamEvent[] {
		this.assertActive("onFunctionCallDone");
		const call = this.toolCalls.get(index);
		if (call?.done) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_INVALID_TRANSITION,
				`Cannot complete tool call at index ${index}: call is already done.`,
			);
		}
		if (!call?.name) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_INCOMPLETE_TOOL_CALL,
				`Cannot complete tool call at index ${index}: call not found or missing name.`,
			);
		}
		if (!call.opened || call.outputIndex === undefined) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_INCOMPLETE_TOOL_CALL,
				`Cannot complete tool call at index ${index}: call not opened.`,
			);
		}

		call.done = true;
		const events: ResponseStreamEvent[] = [];

		const rawItem = this.toolCalls.item(call);
		const finalItem = normalizeItemStatus(rawItem, "completed");
		this.output.markDone(call.outputIndex, finalItem);
		this.refreshSnapshot();

		events.push({
			type: "response.function_call_arguments.done",
			item_id: call.id,
			output_index: call.outputIndex,
			text: call.arguments,
		});
		events.push({
			type: "response.output_item.done",
			output_index: call.outputIndex,
			item: finalItem,
		});

		return events;
	}

	onFinish(status: StreamResponseTerminalStatus): ResponseStreamEvent[] {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, "onFinish");
		if (this.pendingTerminal) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_INVALID_TRANSITION,
				"finish already requested for this stream response.",
			);
		}
		const closeEvents = this.closeAllActiveBlocks();
		if (!this.options.deferTerminal) {
			this.currentPhase = terminalPhase(status.status);
			this.refreshSnapshot();
			this.currentSnapshot = {
				...this.currentSnapshot,
				...status,
				completed_at: this.options.nowSeconds(),
			};
			return [
				...closeEvents,
				{ type: terminalEventType(status.status), response: this.snapshot },
			];
		}
		this.pendingTerminal = status;
		if (this.currentSnapshot.usage) {
			return [...closeEvents, ...this.flushPendingTerminal()];
		}
		return closeEvents;
	}

	onError(error: ResponseError): ResponseStreamEvent[] {
		if (isTerminalPhase(this.currentPhase) || this.pendingTerminal) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_DELTA_AFTER_TERMINAL,
				"Cannot emit error event on a terminated stream response.",
			);
		}
		const closeEvents =
			this.currentPhase === StreamResponsePhase.IN_PROGRESS
				? this.closeAllActiveBlocks()
				: [];
		this.currentPhase = StreamResponsePhase.FAILED;
		this.refreshSnapshot();
		this.currentSnapshot = {
			...this.currentSnapshot,
			status: "failed" as const,
			error,
			completed_at: this.options.nowSeconds(),
		};
		return [
			...closeEvents,
			{ type: "response.failed", response: this.snapshot },
		];
	}

	onUsage(usage: ResponseUsage): ResponseStreamEvent[] {
		this.currentSnapshot = { ...this.currentSnapshot, usage };
		if (this.pendingTerminal) {
			return this.flushPendingTerminal();
		}
		return [];
	}

	finalize(): ResponseStreamEvent[] {
		if (this.pendingTerminal) {
			return this.flushPendingTerminal();
		}
		return [];
	}

	private flushPendingTerminal(): ResponseStreamEvent[] {
		const status = this.pendingTerminal;
		if (!status) return [];
		this.currentPhase = terminalPhase(status.status);
		this.pendingTerminal = undefined;
		this.refreshSnapshot();
		this.currentSnapshot = {
			...this.currentSnapshot,
			...status,
			completed_at: this.options.nowSeconds(),
		};
		return [
			{ type: terminalEventType(status.status), response: this.snapshot },
		];
	}

	private closeAllActiveBlocks(): ResponseStreamEvent[] {
		type Closable = { outputIndex: number; close(): ResponseStreamEvent[] };
		const items: Closable[] = [];

		if (this.activeReasoning) {
			items.push({
				outputIndex: this.activeReasoning.outputIndex,
				close: () => this.closeActiveReasoning(),
			});
		}
		if (this.activeText) {
			items.push({
				outputIndex: this.activeText.outputIndex,
				close: () => this.closeActiveText(),
			});
		}
		if (this.activeRefusal) {
			items.push({
				outputIndex: this.activeRefusal.outputIndex,
				close: () => this.closeActiveRefusal(),
			});
		}
		for (const call of this.toolCalls.openCalls()) {
			const idx = call.outputIndex;
			if (idx !== undefined) {
				items.push({
					outputIndex: idx,
					close: () => this.closeSingleToolCall(call),
				});
			}
		}

		items.sort((a, b) => a.outputIndex - b.outputIndex);
		return items.flatMap((item) => item.close());
	}

	private closeSingleToolCall(call: ToolCallRecord): ResponseStreamEvent[] {
		if (call.outputIndex === undefined) return [];
		call.done = true;
		const outputIdx = call.outputIndex;
		const rawItem = this.toolCalls.item(call);
		const finalItem = normalizeItemStatus(rawItem, "completed");
		this.output.markDone(outputIdx, finalItem);
		return [
			{
				type: "response.function_call_arguments.done",
				item_id: call.id,
				output_index: outputIdx,
				text: call.arguments,
			},
			{
				type: "response.output_item.done",
				output_index: outputIdx,
				item: finalItem,
			},
		];
	}

	private closeActiveReasoning(): ResponseStreamEvent[] {
		if (!this.activeReasoning) return [];
		const block = this.activeReasoning;
		block.done = true;
		const events: ResponseStreamEvent[] = [];
		events.push({
			type: "response.reasoning_text.done",
			item_id: block.itemId,
			output_index: block.outputIndex,
			content_index: block.contentIndex,
			text: block.text,
		});
		events.push({
			type: "response.reasoning_text_part.done",
			item_id: block.itemId,
			output_index: block.outputIndex,
			content_index: block.contentIndex,
			part: { type: "reasoning_text", text: block.text },
		});
		const completedItem = reasoningItem(block);
		this.output.markDone(block.outputIndex, completedItem);
		events.push({
			type: "response.output_item.done",
			output_index: block.outputIndex,
			item: completedItem,
		});
		this.activeReasoning = undefined;
		return events;
	}

	private closeActiveText(): ResponseStreamEvent[] {
		if (!this.activeText) return [];
		const block = this.activeText;
		block.done = true;
		const events: ResponseStreamEvent[] = [];
		events.push({
			type: "response.output_text.done",
			item_id: block.itemId,
			output_index: block.outputIndex,
			content_index: block.contentIndex,
			text: block.text,
		});
		events.push({
			type: "response.content_part.done",
			item_id: block.itemId,
			output_index: block.outputIndex,
			content_index: block.contentIndex,
			part: contentPart(block),
		});
		const completedItem = messageItem(block);
		this.output.markDone(block.outputIndex, completedItem);
		events.push({
			type: "response.output_item.done",
			output_index: block.outputIndex,
			item: completedItem,
		});
		this.activeText = undefined;
		return events;
	}

	private closeActiveRefusal(): ResponseStreamEvent[] {
		if (!this.activeRefusal) return [];
		const block = this.activeRefusal;
		block.done = true;
		const events: ResponseStreamEvent[] = [];
		events.push({
			type: "response.refusal.done",
			item_id: block.itemId,
			output_index: block.outputIndex,
			content_index: block.contentIndex,
			refusal: block.text,
		});
		events.push({
			type: "response.content_part.done",
			item_id: block.itemId,
			output_index: block.outputIndex,
			content_index: block.contentIndex,
			part: contentPart(block),
		});
		const completedItem = messageItem(block);
		this.output.markDone(block.outputIndex, completedItem);
		events.push({
			type: "response.output_item.done",
			output_index: block.outputIndex,
			item: completedItem,
		});
		this.activeRefusal = undefined;
		return events;
	}

	private refreshSnapshot(): void {
		this.currentSnapshot = {
			...this.currentSnapshot,
			output: this.output.items(),
			...(this.outputText ? { output_text: this.outputText } : {}),
		};
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

	private assertActive(action: string): void {
		this.assertPhase(StreamResponsePhase.IN_PROGRESS, action);
		if (this.pendingTerminal) {
			throw streamStateError(
				this.ctx,
				ADAPTER_STREAM_DELTA_AFTER_TERMINAL,
				`${action} cannot run after finish has been requested.`,
			);
		}
	}

	private assertPhase(expected: StreamResponsePhase, action: string): void {
		if (this.currentPhase !== expected) {
			const code =
				expected === StreamResponsePhase.IN_PROGRESS &&
				this.currentPhase === StreamResponsePhase.IDLE
					? ADAPTER_STREAM_OUTPUT_BEFORE_START
					: isTerminalPhase(this.currentPhase)
						? ADAPTER_STREAM_DELTA_AFTER_TERMINAL
						: ADAPTER_STREAM_INVALID_TRANSITION;
			throw streamStateError(
				this.ctx,
				code,
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

const ITEM_TYPES_WITH_STATUS = new Set([
	"function_call",
	"local_shell_call",
	"shell_call",
	"apply_patch_call",
	"tool_search_call",
	"custom_tool_call",
	"web_search_call",
	"file_search_call",
	"code_interpreter_call",
	"image_generation_call",
	"computer_call",
	"message",
	"reasoning",
]);

function normalizeItemStatus(
	item: ResponseItem,
	status: "in_progress" | "completed",
): ResponseItem {
	if (item.type && ITEM_TYPES_WITH_STATUS.has(item.type)) {
		return { ...item, status } as ResponseItem;
	}
	return item;
}

function isTerminalPhase(phase: StreamResponsePhase): boolean {
	return (
		phase === StreamResponsePhase.COMPLETED ||
		phase === StreamResponsePhase.INCOMPLETE ||
		phase === StreamResponsePhase.FAILED
	);
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
