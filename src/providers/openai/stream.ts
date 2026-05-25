import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { StreamMapper } from "../../adapter/mapper/contract";
import {
	StreamPhase,
	StreamState,
	type ToolCallAccumulator,
} from "../../adapter/mapper/stream-state";
import type { ResponsesContext } from "../../context/responses-context";
import type { ChatCompletionChunk } from "../../protocol/openai/completions";
import type {
	ResponseItem,
	ResponseObject,
	ResponseOutputContent,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import {
	buildOpenAIResponseObject,
	openAIStatusFields,
} from "./response-common";
import { mapToolCall } from "./tool-calls";

export class OpenAIStreamMapper implements StreamMapper<ChatCompletionChunk> {
	map(
		ctx: ResponsesContext,
		event: JsonServerSentEvent<ChatCompletionChunk>,
	): ResponseStreamEvent[] {
		const state = StreamState.from(ctx);
		const chunk = event.data;
		const choices = chunk.choices;
		if (!choices || choices.length === 0) return [];

		const choice = choices[0];
		if (!choice) return [];
		const delta = choice.delta ?? {};
		const finishReason = choice.finish_reason;

		const events: ResponseStreamEvent[] = [];

		if (state.phase === StreamPhase.HEADERS) {
			events.push(...this.emitStartEvents(ctx, state));
			state.phase = StreamPhase.CONTENT;
		}

		if (delta.content !== null && delta.content !== undefined) {
			const text = String(delta.content);
			if (text) {
				state.outputText += text;
				events.push({ type: "response.output_text.delta", delta: text });
			}
		}

		const reasoningContent = (delta as Record<string, unknown>)
			.reasoning_content;
		if (reasoningContent != null) {
			const text = String(reasoningContent);
			if (text) {
				state.reasoningContent += text;
				events.push({ type: "response.reasoning_text.delta", delta: text });
			}
		}

		if (delta.refusal !== null && delta.refusal !== undefined) {
			const text = String(delta.refusal);
			state.refusal += text;
			events.push({ type: "response.refusal.delta", delta: text });
		}

		if (delta.tool_calls) {
			for (const tc of delta.tool_calls) {
				if (tc.type !== "function") continue;
				const fn = tc.function;
				const rawIndex = (tc as unknown as Record<string, unknown>).index;
				const index =
					typeof rawIndex === "number" ? rawIndex : state.toolCalls.length;
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

				if (fn?.name) {
					const accumulatedArguments = toolCall.arguments;
					const hadName = toolCall.name !== "";
					toolCall.name = fn.name;
					if (!hadName) {
						events.push({
							type: "response.output_item.added",
							item_id: toolCall.id,
							item: {
								type: "function_call",
								call_id: toolCall.id,
								name: fn.name,
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
					if (!toolCall.name) continue;
					events.push({
						type: "response.function_call_arguments.delta",
						item_id: toolCall.id,
						delta: fn.arguments,
					});
				}
			}
		}

		if (finishReason) {
			events.push(...this.emitEndEvents(ctx, state, finishReason));
			state.phase = StreamPhase.DONE;
		}

		return events;
	}

	private emitStartEvents(
		ctx: ResponsesContext,
		_state: StreamState,
	): ResponseStreamEvent[] {
		const resp = this.buildPartialResponse(ctx, "in_progress");
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
		finishReason: string,
	): ResponseStreamEvent[] {
		state.completedAt = Math.floor(Date.now() / 1000);
		state.finalStatus = openAIStatusFields(finishReason);
		const resp = this.buildResponseObject(ctx, state);
		const terminalType =
			resp.status === "completed"
				? "response.completed"
				: resp.status === "incomplete"
					? "response.incomplete"
					: "response.failed";
		const messageContent: ResponseOutputContent[] = [];
		if (state.outputText) {
			messageContent.push({ type: "output_text", text: state.outputText });
		}
		if (state.refusal) {
			messageContent.push({ type: "refusal", refusal: state.refusal });
		}
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
					content: messageContent,
				},
			},
			...state.toolCalls.flatMap(
				(tc: ToolCallAccumulator): ResponseStreamEvent[] => [
					{
						type: "response.function_call_arguments.done",
						item_id: tc.id,
						text: tc.arguments,
					},
					{
						type: "response.output_item.done",
						response: resp,
						item: mapToolCall(ctx, tc),
					},
				],
			),
			{ type: terminalType, response: resp },
		];
	}

	private buildPartialResponse(
		ctx: ResponsesContext,
		status: ResponseObject["status"] = "in_progress",
	): ResponseObject {
		return buildOpenAIResponseObject(ctx, { status });
	}

	buildResponseObject(
		ctx: ResponsesContext,
		state: StreamState,
	): ResponseObject {
		return buildOpenAIResponseObject(ctx, state.finalStatus, {
			completedAt: state.completedAt ?? Math.floor(Date.now() / 1000),
			outputText: state.outputText,
			output: this.buildOutputItems(ctx, state),
		});
	}

	buildOutputItems(ctx: ResponsesContext, state: StreamState): ResponseItem[] {
		const output: ResponseItem[] = [];
		if (state.reasoningContent) {
			output.push({
				id: `rs_${ctx.responseId}`,
				type: "reasoning",
				summary: [{ type: "summary_text", text: state.reasoningContent }],
			});
		}
		const content: ResponseOutputContent[] = [];
		if (state.outputText) {
			content.push({ type: "output_text", text: state.outputText });
		}
		if (state.refusal) {
			content.push({ type: "refusal", refusal: state.refusal });
		}
		output.push({
			id: `msg_${ctx.responseId}`,
			type: "message",
			role: "assistant",
			status: "completed",
			content,
		});
		for (const tc of state.toolCalls) output.push(mapToolCall(ctx, tc));
		return output;
	}
}
