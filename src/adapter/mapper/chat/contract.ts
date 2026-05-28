import type { ResponsesContext } from "../../../context/responses-context";
import type {
	ResponseItem,
	ResponseObject,
	ResponseUsage,
} from "../../../protocol/openai/responses";
import type { CompatibilityPlan } from "./compatibility-plan";
import type { ResponseStatusFields } from "./response-object-builder";
import type { ToolCallSnapshot } from "./stream-response-state";
import type { ProviderToolSidecars, ProviderToolSurface } from "./tool-surface";

export interface CompatibilityNegotiator {
	negotiate(ctx: ResponsesContext): CompatibilityPlan;
}

export interface ChatMessageMapper<TMessage> {
	map(ctx: ResponsesContext, plan: CompatibilityPlan): TMessage[];
}

export interface ChatToolSurfaceBuilder<
	TTools extends readonly unknown[],
	TSidecars extends ProviderToolSidecars = ProviderToolSidecars,
> {
	map(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
	): ProviderToolSurface<TTools, TSidecars>;
}

export interface ChatToolChoiceMapper<
	TTools extends readonly unknown[],
	TToolChoice,
	TSidecars extends ProviderToolSidecars = ProviderToolSidecars,
> {
	map(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		toolSurface: ProviderToolSurface<TTools, TSidecars>,
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

export interface ChatRequestOptionsMapper<
	TReq,
	TTools extends readonly unknown[] = readonly unknown[],
	TSidecars extends ProviderToolSidecars = ProviderToolSidecars,
> {
	apply(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		request: TReq,
		toolSurface: ProviderToolSurface<TTools, TSidecars>,
	): void;
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
	custom?: {
		name?: string;
		input?: string;
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

export interface ChatToolCallRestorer {
	restore(ctx: ResponsesContext, call: ToolCallSnapshot): ResponseItem;
}
