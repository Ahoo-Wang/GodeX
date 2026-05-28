import {
	ADAPTER_STREAM_DELTA_AFTER_TERMINAL,
	ADAPTER_STREAM_INVALID_TRANSITION,
	ADAPTER_STREAM_OUTPUT_BEFORE_START,
	AdapterError,
	SERVER_ERROR,
} from "../../error";
import type {
	ResponseIncompleteDetails,
	ResponseObject,
	ResponseOutputContent,
	ResponseOutputMessage,
	ResponseStreamEvent,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { Reasoning } from "../../protocol/openai/responses/reasoning";
import type {
	ResponseError,
	ResponseErrorCode,
} from "../../protocol/openai/shared";
import type {
	ProviderStreamError,
	ProviderStreamFinishReason,
} from "./stream-delta";

export enum ResponseStreamPhase {
	IDLE = "idle",
	IN_PROGRESS = "in_progress",
	COMPLETED = "completed",
	INCOMPLETE = "incomplete",
	FAILED = "failed",
}

export interface ResponseStreamStateMachineOptions {
	readonly responseId: string;
	readonly createdAt: number;
	readonly model: string;
	readonly provider: string;
	readonly nowSeconds?: () => number;
}

interface MessageBlock {
	readonly itemId: string;
	readonly outputIndex: number;
	readonly contentIndex: number;
	readonly kind: "text" | "refusal";
	text: string;
	done: boolean;
}

interface ReasoningBlock {
	readonly itemId: string;
	readonly outputIndex: number;
	readonly contentIndex: number;
	text: string;
	done: boolean;
}

interface TerminalFields {
	readonly status: "completed" | "incomplete" | "failed";
	readonly error: ResponseError | null;
	readonly incomplete_details: ResponseIncompleteDetails | null;
}

export class ResponseStreamStateMachine {
	private currentPhase = ResponseStreamPhase.IDLE;
	private currentSnapshot: ResponseObject;
	private readonly nowSeconds: () => number;
	private readonly output: ResponseObject["output"] = [];
	private activeText?: MessageBlock;
	private activeRefusal?: MessageBlock;
	private activeReasoning?: ReasoningBlock;
	private outputText = "";
	private pendingFinishReason?: ProviderStreamFinishReason | null;

	constructor(private readonly options: ResponseStreamStateMachineOptions) {
		this.nowSeconds =
			options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
		this.currentSnapshot = {
			id: options.responseId,
			object: "response",
			created_at: options.createdAt,
			status: "queued",
			model: options.model,
			output: [],
			output_text: "",
			usage: null,
			error: null,
			incomplete_details: null,
		};
	}

	get phase(): ResponseStreamPhase {
		return this.currentPhase;
	}

	get snapshot(): ResponseObject {
		return this.currentSnapshot;
	}

	get provider(): string {
		return this.options.provider;
	}

	get deferredFinishReason(): ProviderStreamFinishReason | null | undefined {
		return this.pendingFinishReason;
	}

	get model(): string {
		return this.options.model;
	}

	start(): ResponseStreamEvent[] {
		this.assertPhase(ResponseStreamPhase.IDLE, "start");
		this.currentPhase = ResponseStreamPhase.IN_PROGRESS;
		this.currentSnapshot = {
			...this.currentSnapshot,
			status: "in_progress",
		};
		return [
			{ type: "response.created", response: this.currentSnapshot },
			{ type: "response.in_progress", response: this.currentSnapshot },
		];
	}

	text(delta: string): ResponseStreamEvent[] {
		return this.messageDelta("text", delta);
	}

	refusal(delta: string): ResponseStreamEvent[] {
		return this.messageDelta("refusal", delta);
	}

	reasoning(delta: string): ResponseStreamEvent[] {
		this.assertActive("reasoning");
		this.assertNoPendingFinish("reasoning");
		if (!delta) return [];

		const block = this.ensureReasoningBlock();
		const events: ResponseStreamEvent[] = [];
		if (block.text === "") {
			const item = reasoningItem(block);
			this.output.push(item);
			events.push({
				type: "response.output_item.added",
				output_index: block.outputIndex,
				item,
			});
			events.push({
				type: "response.reasoning_text_part.added",
				item_id: block.itemId,
				output_index: block.outputIndex,
				content_index: block.contentIndex,
				part: { type: "reasoning_text", text: "" },
			});
		}

		block.text += delta;
		this.output[block.outputIndex] = reasoningItem(block);
		this.refreshSnapshot();

		events.push({
			type: "response.reasoning_text.delta",
			item_id: block.itemId,
			output_index: block.outputIndex,
			content_index: block.contentIndex,
			delta,
		});
		return events;
	}

	usage(usage: ResponseUsage): ResponseStreamEvent[] {
		this.assertActive("usage");
		this.currentSnapshot = {
			...this.currentSnapshot,
			usage,
		};
		return [];
	}

	deferFinish(
		finishReason: ProviderStreamFinishReason | null | undefined,
	): ResponseStreamEvent[] {
		this.assertActive("finish");
		this.pendingFinishReason = finishReason;
		return [];
	}

	finish(
		finishReason: ProviderStreamFinishReason | null | undefined,
	): ResponseStreamEvent[] {
		this.assertActive("finish");
		this.pendingFinishReason = undefined;
		const terminal = mapFinishReason(this.options.provider, finishReason);
		const closeEvents = this.closeActiveBlocks();
		this.currentPhase = terminalPhase(terminal.status);
		this.refreshSnapshot();
		this.currentSnapshot = {
			...this.currentSnapshot,
			status: terminal.status,
			error: terminal.error,
			incomplete_details: terminal.incomplete_details,
			completed_at: this.nowSeconds(),
		};
		return [
			...closeEvents,
			{
				type: terminalEventType(terminal.status),
				response: this.currentSnapshot,
			},
		];
	}

	fail(error: ProviderStreamError): ResponseStreamEvent[] {
		this.assertActive("fail");
		const closeEvents = this.closeActiveBlocks();
		this.currentPhase = ResponseStreamPhase.FAILED;
		this.refreshSnapshot();
		this.currentSnapshot = {
			...this.currentSnapshot,
			status: "failed",
			error: normalizeError(error),
			incomplete_details: null,
			completed_at: this.nowSeconds(),
		};
		return [
			...closeEvents,
			{ type: "response.failed", response: this.currentSnapshot },
		];
	}

	private messageDelta(
		kind: MessageBlock["kind"],
		delta: string,
	): ResponseStreamEvent[] {
		this.assertActive(kind);
		this.assertNoPendingFinish(kind);
		if (!delta) return [];

		const block = this.ensureMessageBlock(kind);
		const events: ResponseStreamEvent[] = [];
		if (block.text === "") {
			const item = messageItem(block);
			this.output.push(item);
			events.push({
				type: "response.output_item.added",
				output_index: block.outputIndex,
				item,
			});
			events.push({
				type: "response.content_part.added",
				item_id: block.itemId,
				output_index: block.outputIndex,
				content_index: block.contentIndex,
				part: contentPart(block),
			});
		}

		block.text += delta;
		if (kind === "text") {
			this.outputText += delta;
		}
		this.refreshSnapshot();

		events.push(
			kind === "text"
				? {
						type: "response.output_text.delta",
						item_id: block.itemId,
						output_index: block.outputIndex,
						content_index: block.contentIndex,
						delta,
					}
				: {
						type: "response.refusal.delta",
						item_id: block.itemId,
						output_index: block.outputIndex,
						content_index: block.contentIndex,
						delta,
					},
		);
		return events;
	}

	private ensureMessageBlock(kind: MessageBlock["kind"]): MessageBlock {
		const active = kind === "text" ? this.activeText : this.activeRefusal;
		if (active) return active;

		const block: MessageBlock = {
			itemId: `msg_${this.options.responseId}_${this.output.length}`,
			outputIndex: this.output.length,
			contentIndex: 0,
			kind,
			text: "",
			done: false,
		};
		if (kind === "text") {
			this.activeText = block;
		} else {
			this.activeRefusal = block;
		}
		return block;
	}

	private ensureReasoningBlock(): ReasoningBlock {
		if (this.activeReasoning) return this.activeReasoning;
		const block: ReasoningBlock = {
			itemId: `reasoning_${this.options.responseId}_${this.output.length}`,
			outputIndex: this.output.length,
			contentIndex: 0,
			text: "",
			done: false,
		};
		this.activeReasoning = block;
		return block;
	}

	private closeActiveBlocks(): ResponseStreamEvent[] {
		const blocks = [this.activeText, this.activeRefusal, this.activeReasoning]
			.filter((block): block is MessageBlock | ReasoningBlock => Boolean(block))
			.sort((left, right) => left.outputIndex - right.outputIndex);
		return blocks.flatMap((block) =>
			isReasoningBlock(block)
				? this.closeReasoningBlock(block)
				: this.closeMessageBlock(block),
		);
	}

	private closeMessageBlock(block: MessageBlock): ResponseStreamEvent[] {
		if (block.done) return [];
		block.done = true;
		const completedItem = messageItem(block);
		this.output[block.outputIndex] = completedItem;
		if (block.kind === "text") {
			this.activeText = undefined;
		} else {
			this.activeRefusal = undefined;
		}
		this.refreshSnapshot();

		return [
			block.kind === "text"
				? {
						type: "response.output_text.done",
						item_id: block.itemId,
						output_index: block.outputIndex,
						content_index: block.contentIndex,
						text: block.text,
					}
				: {
						type: "response.refusal.done",
						item_id: block.itemId,
						output_index: block.outputIndex,
						content_index: block.contentIndex,
						refusal: block.text,
					},
			{
				type: "response.content_part.done",
				item_id: block.itemId,
				output_index: block.outputIndex,
				content_index: block.contentIndex,
				part: contentPart(block),
			},
			{
				type: "response.output_item.done",
				output_index: block.outputIndex,
				item: completedItem,
			},
		];
	}

	private closeReasoningBlock(block: ReasoningBlock): ResponseStreamEvent[] {
		if (block.done) return [];
		block.done = true;
		const completedItem = reasoningItem(block);
		this.output[block.outputIndex] = completedItem;
		this.activeReasoning = undefined;
		this.refreshSnapshot();

		return [
			{
				type: "response.reasoning_text.done",
				item_id: block.itemId,
				output_index: block.outputIndex,
				content_index: block.contentIndex,
				text: block.text,
			},
			{
				type: "response.reasoning_text_part.done",
				item_id: block.itemId,
				output_index: block.outputIndex,
				content_index: block.contentIndex,
				part: { type: "reasoning_text", text: block.text },
			},
			{
				type: "response.output_item.done",
				output_index: block.outputIndex,
				item: completedItem,
			},
		];
	}

	private refreshSnapshot(): void {
		this.currentSnapshot = {
			...this.currentSnapshot,
			output: [...this.output],
			output_text: this.outputText,
		};
	}

	private assertActive(action: string): void {
		this.assertPhase(ResponseStreamPhase.IN_PROGRESS, action);
	}

	private assertNoPendingFinish(action: string): void {
		if (this.pendingFinishReason === undefined) return;
		throw this.error(
			ADAPTER_STREAM_DELTA_AFTER_TERMINAL,
			`${action} cannot run after provider finish reason was observed.`,
			{ action, finishReason: this.pendingFinishReason },
		);
	}

	private assertPhase(expected: ResponseStreamPhase, action: string): void {
		if (this.currentPhase === expected) return;
		const code =
			expected === ResponseStreamPhase.IN_PROGRESS &&
			this.currentPhase === ResponseStreamPhase.IDLE
				? ADAPTER_STREAM_OUTPUT_BEFORE_START
				: isTerminalPhase(this.currentPhase)
					? ADAPTER_STREAM_DELTA_AFTER_TERMINAL
					: ADAPTER_STREAM_INVALID_TRANSITION;
		throw this.error(
			code,
			`${action} cannot run while stream response phase is ${this.currentPhase}.`,
			{ action, phase: this.currentPhase },
		);
	}

	private error(
		code: string,
		message: string,
		context: Record<string, unknown> = {},
	): AdapterError {
		return new AdapterError(code, message, {
			provider: this.options.provider,
			model: this.options.model,
			...context,
		});
	}
}

function messageItem(block: MessageBlock): ResponseOutputMessage {
	return {
		id: block.itemId,
		type: "message",
		role: "assistant",
		status: block.done ? "completed" : "in_progress",
		content: block.done ? [contentPart(block)] : [],
	};
}

function reasoningItem(block: ReasoningBlock): Reasoning {
	return {
		id: block.itemId,
		type: "reasoning",
		status: block.done ? "completed" : "in_progress",
		summary: [],
		content: block.done ? [{ type: "reasoning_text", text: block.text }] : [],
	};
}

function isReasoningBlock(
	block: MessageBlock | ReasoningBlock,
): block is ReasoningBlock {
	return block.itemId.startsWith("reasoning_");
}

function contentPart(block: MessageBlock): ResponseOutputContent {
	return block.kind === "text"
		? { type: "output_text", text: block.done ? block.text : "" }
		: { type: "refusal", refusal: block.done ? block.text : "" };
}

function mapFinishReason(
	provider: string,
	finishReason: ProviderStreamFinishReason | null | undefined,
): TerminalFields {
	switch (finishReason) {
		case "stop":
		case "tool_calls":
			return {
				status: "completed",
				error: null,
				incomplete_details: null,
			};
		case "length":
		case "model_context_window_exceeded":
			return {
				status: "incomplete",
				error: null,
				incomplete_details: { reason: "max_output_tokens" },
			};
		case "content_filter":
		case "sensitive":
			return {
				status: "incomplete",
				error: null,
				incomplete_details: { reason: "content_filter" },
			};
		case undefined:
		case null:
			return {
				status: "failed",
				error: {
					code: SERVER_ERROR,
					message: `Provider ${provider} returned no finish reason.`,
				},
				incomplete_details: null,
			};
		default:
			return {
				status: "failed",
				error: {
					code: SERVER_ERROR,
					message: `Provider ${provider} returned unexpected finish reason: ${finishReason}.`,
				},
				incomplete_details: null,
			};
	}
}

function normalizeError(error: ProviderStreamError): ResponseError {
	return {
		code: normalizeResponseErrorCode(error.code),
		message: error.message,
	};
}

const RESPONSE_ERROR_CODES = new Set<ResponseErrorCode>([
	"server_error",
	"rate_limit_exceeded",
	"invalid_prompt",
	"vector_store_timeout",
	"invalid_image",
	"invalid_image_format",
	"invalid_base64_image",
	"invalid_image_url",
	"image_too_large",
	"image_too_small",
	"image_parse_error",
	"image_content_policy_violation",
	"invalid_image_mode",
	"image_file_too_large",
	"unsupported_image_media_type",
	"empty_image_file",
	"failed_to_download_image",
	"image_file_not_found",
]);

function normalizeResponseErrorCode(code: string): ResponseErrorCode {
	return RESPONSE_ERROR_CODES.has(code as ResponseErrorCode)
		? (code as ResponseErrorCode)
		: SERVER_ERROR;
}

function terminalPhase(status: TerminalFields["status"]): ResponseStreamPhase {
	switch (status) {
		case "completed":
			return ResponseStreamPhase.COMPLETED;
		case "incomplete":
			return ResponseStreamPhase.INCOMPLETE;
		case "failed":
			return ResponseStreamPhase.FAILED;
	}
}

function terminalEventType(
	status: TerminalFields["status"],
): ResponseStreamEvent["type"] {
	switch (status) {
		case "completed":
			return "response.completed";
		case "incomplete":
			return "response.incomplete";
		case "failed":
			return "response.failed";
	}
}

function isTerminalPhase(phase: ResponseStreamPhase): boolean {
	return (
		phase === ResponseStreamPhase.COMPLETED ||
		phase === ResponseStreamPhase.INCOMPLETE ||
		phase === ResponseStreamPhase.FAILED
	);
}
