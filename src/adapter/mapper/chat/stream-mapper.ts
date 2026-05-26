import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseStreamEvent } from "../../../protocol/openai/responses";
import type { StreamMapper } from "../contract";
import type {
	ChatFinishReasonMapper,
	ChatStreamDeltaMapper,
	ChatStreamToolCallDelta,
	ChatToolCallIdentityResolver,
	ChatToolCallMapper,
} from "./contract";
import {
	type FunctionCallDelta,
	StreamResponsePhase,
	StreamResponseState,
} from "./stream-response-state";

export interface ChatStreamMapperOptions<TChunk, TDelta, TFinishReason> {
	delta: ChatStreamDeltaMapper<TChunk, TDelta, TFinishReason>;
	finishReason: ChatFinishReasonMapper<TFinishReason>;
	identity: ChatToolCallIdentityResolver;
	toolCall: ChatToolCallMapper;
	deferTerminal?: boolean;
}

export class ChatStreamMapper<TChunk, TDelta, TFinishReason extends string>
	implements StreamMapper<TChunk>
{
	constructor(
		private readonly options: ChatStreamMapperOptions<
			TChunk,
			TDelta,
			TFinishReason
		>,
	) {}

	map(
		ctx: ResponsesContext,
		event: JsonServerSentEvent<TChunk>,
	): ResponseStreamEvent[] {
		const state =
			StreamResponseState.get(ctx) ??
			StreamResponseState.create(ctx, {
				toolCallOutputItemMapper: (call) =>
					this.options.toolCall.map(
						ctx,
						call,
						this.options.identity.resolve(ctx, call.name),
					),
				deferTerminal: this.options.deferTerminal ?? false,
			});
		const choice = this.options.delta.extractChoice(event.data);
		if (!choice) {
			const usage = this.options.delta.extractUsage(event.data);
			if (usage) return state.onUsage(usage);
			return [];
		}

		const events: ResponseStreamEvent[] = [];
		if (state.phase === StreamResponsePhase.IDLE) {
			events.push(...state.start());
		}

		const text = this.options.delta.extractText(choice.delta);
		if (text) events.push(...state.onTextDelta(text));

		const reasoningText = this.options.delta.extractReasoningText(choice.delta);
		if (reasoningText) {
			events.push(...state.onReasoningTextDelta(reasoningText));
		}

		const refusalText = this.options.delta.extractRefusalText(choice.delta);
		if (refusalText) events.push(...state.onRefusalDelta(refusalText));

		for (const toolCallDelta of this.options.delta.extractToolCalls(
			choice.delta,
		)) {
			events.push(
				...state.onFunctionCallDelta(toFunctionCallDelta(toolCallDelta)),
			);
		}

		const usage = this.options.delta.extractUsage(event.data);
		if (usage) events.push(...state.onUsage(usage));

		if (choice.finishReason) {
			events.push(
				...state.onFinish(
					this.options.finishReason.map(choice.finishReason) as Parameters<
						typeof state.onFinish
					>[0],
				),
			);
		}

		return events;
	}
}

function toFunctionCallDelta(tc: ChatStreamToolCallDelta): FunctionCallDelta {
	return {
		index: tc.index,
		id: tc.id,
		name: tc.function?.name,
		arguments: tc.function?.arguments,
	};
}
