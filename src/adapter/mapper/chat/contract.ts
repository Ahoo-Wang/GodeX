import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ResponseItem,
	ResponseObject,
	ResponseUsage,
} from "../../../protocol/openai/responses";
import type { CompatibilityPlan } from "./compatibility-plan";
import type { ResponseStatusFields } from "./response-object-builder";
import type { ToolCallSnapshot } from "./stream-response-state";

export interface CompatibilityNegotiator {
	negotiate(ctx: ResponsesContext): CompatibilityPlan;
}

export interface ChatMessageMapper<TMessage> {
	map(ctx: ResponsesContext, plan: CompatibilityPlan): TMessage[];
}

export interface ChatToolMapper<TTools> {
	map(ctx: ResponsesContext, plan: CompatibilityPlan): TTools | undefined;
}

export interface ChatToolChoiceMapper<TTools, TToolChoice> {
	map(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		tools: TTools | undefined,
	): TToolChoice | undefined;
}

export interface ChatCompletionRequestShape<TMessage, TTools, TToolChoice> {
	model: string;
	messages: TMessage[];
	tools?: TTools;
	tool_choice?: TToolChoice;
}

export interface ChatChoiceExtractor<TSource, TChoice> {
	firstChoice(source: TSource): TChoice | undefined;
}

/**
 * Creates the minimum valid provider request skeleton.
 * The returned {@link messages} value is a placeholder — it will be
 * overwritten by {@link ChatMessageMapper.map} during composition.
 * Only required provider fields (model, empty containers) belong here;
 * optional parameters belong in {@link ChatRequestOptionsMapper}.
 */
export interface ChatRequestFactory<TReq> {
	create(ctx: ResponsesContext, plan: CompatibilityPlan): TReq;
}

export interface ChatRequestOptionsMapper<TReq> {
	apply(ctx: ResponsesContext, plan: CompatibilityPlan, request: TReq): void;
}

export interface ChatResponseAccessor<TRes, TChoice, TFinishReason>
	extends ChatChoiceExtractor<TRes, TChoice> {
	finishReason(
		choice: TChoice | undefined,
	): TFinishReason | string | null | undefined;
}

export interface ChatResponseOutputMapper<TRes> {
	map(ctx: ResponsesContext, result: TRes): ResponseObject["output"];
}

export interface ChatUsageMapper<TSource> {
	map(source: TSource): ResponseUsage | undefined;
}

export interface ChatFinishReasonMapper<TFinishReason> {
	map(
		finishReason: TFinishReason | string | null | undefined,
	): ResponseStatusFields;
}

export interface ChatStreamChoice<TDelta, TFinishReason> {
	delta: TDelta;
	finishReason?: TFinishReason | null;
}

export interface ChatStreamToolCallDelta {
	index?: number;
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
}

export interface ChatStreamDeltaMapper<TChunk, TDelta, TFinishReason> {
	extractChoice(chunk: TChunk): ChatStreamChoice<TDelta, TFinishReason> | null;
	extractText(delta: TDelta): string;
	extractReasoningText(delta: TDelta): string;
	extractRefusalText(delta: TDelta): string;
	extractToolCalls(delta: TDelta): ChatStreamToolCallDelta[];
	extractUsage(chunk: TChunk): ResponseUsage | undefined;
}

export interface ChatToolCallIdentity {
	upstreamName: string;
	name: string;
	namespace?: string;
}

export interface ChatToolCallIdentityResolver {
	resolve(ctx: ResponsesContext, upstreamName: string): ChatToolCallIdentity;
}

export interface ChatToolCallMapper {
	map(
		ctx: ResponsesContext,
		call: ToolCallSnapshot,
		identity: ChatToolCallIdentity,
	): ResponseItem;
}
