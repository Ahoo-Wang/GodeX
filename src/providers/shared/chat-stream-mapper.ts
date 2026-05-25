import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { StreamMapper } from "../../adapter/mapper/contract";
import {
	type StatusFields,
	StreamPhase,
	StreamState,
	type ToolCallAccumulator,
} from "../../adapter/mapper/stream-state";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseItem,
	ResponseObject,
	ResponseOutputContent,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import { buildChatResponseObject } from "./response-object";
import { findFlattenedNamespaceTool } from "./tool-name-mapping";

export interface ChatStreamToolCallDelta {
	index?: number;
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
}

export interface ChatStreamChoice<TDelta, TFinishReason extends string> {
	delta: TDelta;
	finishReason?: TFinishReason | null;
}

export abstract class ChatCompletionStreamMapper<
	TChunk,
	TDelta,
	TFinishReason extends string,
> implements StreamMapper<TChunk>
{
	map(
		ctx: ResponsesContext,
		event: JsonServerSentEvent<TChunk>,
	): ResponseStreamEvent[] {
		const state = StreamState.from(ctx);
		const choice = this.extractChoice(event.data);
		if (!choice) return [];

		const events: ResponseStreamEvent[] = [];
		if (state.phase === StreamPhase.HEADERS) {
			events.push(...this.emitStartEvents(ctx));
			state.phase = StreamPhase.CONTENT;
		}

		const text = this.extractText(choice.delta);
		if (text) {
			state.outputText += text;
			events.push({ type: "response.output_text.delta", delta: text });
		}

		const reasoningText = this.extractReasoningText(choice.delta);
		if (reasoningText) {
			state.reasoningContent += reasoningText;
			events.push({
				type: "response.reasoning_text.delta",
				delta: reasoningText,
			});
		}

		const refusalText = this.extractRefusalText(choice.delta);
		if (refusalText) {
			state.refusal += refusalText;
			events.push({ type: "response.refusal.delta", delta: refusalText });
		}

		for (const toolCallDelta of this.extractToolCalls(choice.delta)) {
			events.push(...this.accumulateToolCall(ctx, state, toolCallDelta));
		}

		if (choice.finishReason) {
			events.push(...this.emitEndEvents(ctx, state, choice.finishReason));
			state.phase = StreamPhase.DONE;
		}

		return events;
	}

	protected abstract extractChoice(
		chunk: TChunk,
	): ChatStreamChoice<TDelta, TFinishReason> | null;

	protected abstract extractText(delta: TDelta): string;

	protected extractReasoningText(_delta: TDelta): string {
		return "";
	}

	protected extractRefusalText(_delta: TDelta): string {
		return "";
	}

	protected extractToolCalls(_delta: TDelta): ChatStreamToolCallDelta[] {
		return [];
	}

	protected abstract mapFinishReason(finishReason: TFinishReason): StatusFields;

	protected abstract mapToolCall(
		ctx: ResponsesContext,
		toolCall: ToolCallAccumulator,
	): ResponseItem;

	protected resolveToolCallIdentity(
		_ctx: ResponsesContext,
		upstreamName: string,
	): { name: string; namespace?: string } {
		const match = findFlattenedNamespaceTool(_ctx.request.tools, upstreamName);
		return match ?? { name: upstreamName };
	}

	abstract buildResponseObject(
		ctx: ResponsesContext,
		state: StreamState,
	): ResponseObject;

	buildOutputItems(ctx: ResponsesContext, state: StreamState): ResponseItem[] {
		const output: ResponseItem[] = [];
		if (state.reasoningContent) {
			output.push({
				id: `rs_${ctx.responseId}`,
				type: "reasoning",
				summary: [{ type: "summary_text", text: state.reasoningContent }],
			});
		}
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content: this.finalMessageContent(state),
		});
		for (const tc of state.toolCalls) output.push(this.mapToolCall(ctx, tc));
		return output;
	}

	protected doneMessageContent(state: StreamState): ResponseOutputContent[] {
		return this.finalMessageContent(state);
	}

	protected finalMessageContent(state: StreamState): ResponseOutputContent[] {
		const content: ResponseOutputContent[] = [];
		if (state.outputText) {
			content.push({ type: "output_text", text: state.outputText });
		}
		if (state.refusal) {
			content.push({ type: "refusal", refusal: state.refusal });
		}
		return content;
	}

	private emitStartEvents(ctx: ResponsesContext): ResponseStreamEvent[] {
		const resp = buildChatResponseObject(ctx, { status: "in_progress" });
		return [
			{ type: "response.created", response: resp },
			{ type: "response.in_progress", response: resp },
			{
				type: "response.output_item.added",
				response: resp,
				item: {
					id: `msg_${ctx.responseId}`,
					type: "message",
					role: "assistant",
					status: "in_progress",
					content: [],
				},
			},
			{
				type: "response.content_part.added",
				response: resp,
				part: { type: "output_text", text: "" },
			},
		];
	}

	private emitEndEvents(
		ctx: ResponsesContext,
		state: StreamState,
		finishReason: TFinishReason,
	): ResponseStreamEvent[] {
		state.completedAt = Math.floor(Date.now() / 1000);
		state.finalStatus = this.mapFinishReason(finishReason);
		const resp = this.buildResponseObject(ctx, state);
		const terminalType =
			resp.status === "completed"
				? "response.completed"
				: resp.status === "incomplete"
					? "response.incomplete"
					: "response.failed";
		return [
			{
				type: "response.output_text.done",
				response: resp,
				text: state.outputText,
			},
			{
				type: "response.content_part.done",
				response: resp,
				part: { type: "output_text", text: state.outputText },
			},
			{
				type: "response.output_item.done",
				response: resp,
				item: {
					id: `msg_${ctx.responseId}`,
					type: "message",
					role: "assistant",
					status: "completed",
					content: this.doneMessageContent(state),
				},
			},
			...state.toolCalls.flatMap((tc): ResponseStreamEvent[] => [
				{
					type: "response.function_call_arguments.done",
					item_id: tc.id,
					text: tc.arguments,
				},
				{
					type: "response.output_item.done",
					response: resp,
					item: this.mapToolCall(ctx, tc),
				},
			]),
			{ type: terminalType, response: resp },
		];
	}

	private accumulateToolCall(
		ctx: ResponsesContext,
		state: StreamState,
		tc: ChatStreamToolCallDelta,
	): ResponseStreamEvent[] {
		const fn = tc.function;
		const index =
			typeof tc.index === "number" ? tc.index : state.toolCalls.length;
		let toolCall = state.toolCalls.find((item) => item.index === index);
		if (!toolCall) {
			toolCall = {
				index,
				id: typeof tc.id === "string" ? tc.id : `call_${index}`,
				name: "",
				arguments: "",
			};
			state.toolCalls.push(toolCall);
		} else if (typeof tc.id === "string") {
			toolCall.id = tc.id;
		}

		const events: ResponseStreamEvent[] = [];
		if (fn?.name) {
			const accumulatedArguments = toolCall.arguments;
			const hadName = toolCall.name !== "";
			toolCall.name = fn.name;
			if (!hadName) {
				const identity = this.resolveToolCallIdentity(ctx, fn.name);
				events.push({
					type: "response.output_item.added",
					item_id: toolCall.id,
					item: {
						type: "function_call",
						call_id: toolCall.id,
						...identity,
						arguments: "",
					},
				});
				if (accumulatedArguments) {
					events.push({
						type: "response.function_call_arguments.delta",
						item_id: toolCall.id,
						delta: accumulatedArguments,
					});
				}
			}
		}
		if (fn?.arguments) {
			toolCall.arguments += fn.arguments;
			if (!toolCall.name) return events;
			events.push({
				type: "response.function_call_arguments.delta",
				item_id: toolCall.id,
				delta: fn.arguments,
			});
		}
		return events;
	}
}
