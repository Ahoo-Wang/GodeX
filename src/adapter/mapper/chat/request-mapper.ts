import type { ResponsesContext } from "../../../context/responses-context";
import type { RequestMapper } from "../contract";
import type {
	ChatCompletionRequestShape,
	ChatMessageMapper,
	ChatRequestFactory,
	ChatRequestOptionsMapper,
	ChatToolChoiceMapper,
	ChatToolIndexBuilder,
	CompatibilityNegotiator,
} from "./contract";
import {
	ensureOutputFormatContractSlot,
	OutputFormatContract,
} from "./output-format-contract";
import {
	ensureToolIndexSlot,
	type ProviderToolIndexSidecars,
} from "./tool-index";

export interface ChatRequestMapperOptions<
	TReq extends ChatCompletionRequestShape<TMessage, TTools, TToolChoice>,
	TMessage,
	TTools extends readonly unknown[],
	TToolChoice,
	TSidecars extends ProviderToolIndexSidecars = ProviderToolIndexSidecars,
> {
	negotiator: CompatibilityNegotiator;
	factory: ChatRequestFactory<TReq>;
	messages: ChatMessageMapper<TMessage>;
	tools: ChatToolIndexBuilder<TTools, TSidecars>;
	toolChoice: ChatToolChoiceMapper<TTools, TToolChoice, TSidecars>;
	options: ChatRequestOptionsMapper<TReq, TTools, TSidecars>;
}

export class ChatRequestMapper<
	TReq extends ChatCompletionRequestShape<TMessage, TTools, TToolChoice>,
	TMessage,
	TTools extends readonly unknown[],
	TToolChoice,
	TSidecars extends ProviderToolIndexSidecars = ProviderToolIndexSidecars,
> implements RequestMapper<TReq>
{
	constructor(
		private readonly options: ChatRequestMapperOptions<
			TReq,
			TMessage,
			TTools,
			TToolChoice,
			TSidecars
		>,
	) {}

	map(ctx: ResponsesContext): TReq {
		const plan = this.options.negotiator.negotiate(ctx);
		ensureOutputFormatContractSlot(ctx).set(
			OutputFormatContract.fromRequestFormat(ctx.request.text?.format, plan),
		);
		const request = this.options.factory.create(ctx, plan);
		request.messages = this.options.messages.map(ctx, plan);

		const toolIndex = this.options.tools.map(ctx, plan);
		ensureToolIndexSlot(ctx).set(toolIndex);
		if (toolIndex.hasDeclarations()) {
			request.tools = toolIndex.declarations();
		}

		const toolChoice = this.options.toolChoice.map(ctx, plan, toolIndex);
		if (toolChoice !== undefined) request.tool_choice = toolChoice;

		this.options.options.apply(ctx, plan, request, toolIndex);
		return request;
	}
}
