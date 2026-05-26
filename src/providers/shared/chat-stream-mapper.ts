import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { StreamMapper } from "../../adapter/mapper/contract";
import {
	type FunctionCallDelta,
	StreamResponsePhase,
	StreamResponseState,
	type StreamResponseTerminalStatus,
	type ToolCallSnapshot,
} from "../../adapter/mapper/stream-response-state";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseItem,
	ResponseStreamEvent,
	ResponseUsage,
} from "../../protocol/openai/responses";
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
	protected deferTerminal = false;

	map(
		ctx: ResponsesContext,
		event: JsonServerSentEvent<TChunk>,
	): ResponseStreamEvent[] {
		const state =
			StreamResponseState.get(ctx) ??
			StreamResponseState.create(ctx, {
				toolCallOutputItemMapper: (call) => this.mapToolCall(ctx, call),
				deferTerminal: this.deferTerminal,
			});
		const choice = this.extractChoice(event.data);
		if (!choice) {
			const usage = this.extractUsage(event.data);
			if (usage) return state.onUsage(usage);
			return [];
		}

		const events: ResponseStreamEvent[] = [];
		if (state.phase === StreamResponsePhase.IDLE) {
			events.push(...state.start());
		}

		const text = this.extractText(choice.delta);
		if (text) {
			events.push(...state.onTextDelta(text));
		}

		const reasoningText = this.extractReasoningText(choice.delta);
		if (reasoningText) {
			events.push(...state.onReasoningTextDelta(reasoningText));
		}

		const refusalText = this.extractRefusalText(choice.delta);
		if (refusalText) {
			events.push(...state.onRefusalDelta(refusalText));
		}

		for (const toolCallDelta of this.extractToolCalls(choice.delta)) {
			events.push(
				...state.onFunctionCallDelta(this.toFunctionCallDelta(toolCallDelta)),
			);
		}

		// Set usage before onFinish so terminal event carries usage
		const usage = this.extractUsage(event.data);
		if (usage) {
			events.push(...state.onUsage(usage));
		}

		if (choice.finishReason) {
			events.push(...state.onFinish(this.mapFinishReason(choice.finishReason)));
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

	protected extractUsage(_chunk: TChunk): ResponseUsage | undefined {
		return undefined;
	}

	protected abstract mapFinishReason(
		finishReason: TFinishReason,
	): StreamResponseTerminalStatus;

	protected abstract mapToolCall(
		ctx: ResponsesContext,
		toolCall: ToolCallSnapshot,
	): ResponseItem;

	protected resolveToolCallIdentity(
		_ctx: ResponsesContext,
		upstreamName: string,
	): { name: string; namespace?: string } {
		const match = findFlattenedNamespaceTool(_ctx.request.tools, upstreamName);
		return match ?? { name: upstreamName };
	}

	private toFunctionCallDelta(tc: ChatStreamToolCallDelta): FunctionCallDelta {
		return {
			index: tc.index,
			id: tc.id,
			name: tc.function?.name,
			arguments: tc.function?.arguments,
		};
	}
}
