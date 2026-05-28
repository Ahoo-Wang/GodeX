import type { ResponsesContext } from "../../../context/responses-context";
import type { RequestMapper } from "../contract";
import type {
	ChatCompletionRequestShape,
	ChatMessageMapper,
	ChatRequestFactory,
	ChatRequestOptionsMapper,
	ChatToolChoiceMapper,
	ChatToolSurfaceBuilder,
	CompatibilityNegotiator,
} from "./contract";
import {
	ensureOutputFormatContractSlot,
	OutputFormatContract,
} from "./output-format-contract";
import {
	ensureToolSurfaceSlot,
	type ProviderToolSidecars,
} from "./tool-surface";

export interface ChatRequestMapperOptions<
	TReq extends ChatCompletionRequestShape<TMessage, TTools, TToolChoice>,
	TMessage,
	TTools extends readonly unknown[],
	TToolChoice,
	TSidecars extends ProviderToolSidecars = ProviderToolSidecars,
> {
	negotiator: CompatibilityNegotiator;
	factory: ChatRequestFactory<TReq>;
	messages: ChatMessageMapper<TMessage>;
	tools: ChatToolSurfaceBuilder<TTools, TSidecars>;
	toolChoice: ChatToolChoiceMapper<TTools, TToolChoice, TSidecars>;
	options: ChatRequestOptionsMapper<TReq, TTools, TSidecars>;
}

export class ChatRequestMapper<
	TReq extends ChatCompletionRequestShape<TMessage, TTools, TToolChoice>,
	TMessage,
	TTools extends readonly unknown[],
	TToolChoice,
	TSidecars extends ProviderToolSidecars = ProviderToolSidecars,
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

		const toolSurface = this.options.tools.map(ctx, plan);
		ensureToolSurfaceSlot(ctx).set(toolSurface);
		if (toolSurface.hasDeclarations()) {
			request.tools = toolSurface.declarations();
		}

		const toolChoice = this.options.toolChoice.map(ctx, plan, toolSurface);
		if (toolChoice !== undefined) request.tool_choice = toolChoice;

		this.options.options.apply(ctx, plan, request, toolSurface);
		return request;
	}
}
