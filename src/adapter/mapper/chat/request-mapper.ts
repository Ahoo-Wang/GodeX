import type { ResponsesContext } from "../../../context/responses-context";
import type { RequestMapper } from "../contract";
import type {
	ChatCompletionRequestShape,
	ChatMessageMapper,
	ChatRequestFactory,
	ChatRequestOptionsMapper,
	ChatToolChoiceMapper,
	ChatToolMapper,
	CompatibilityNegotiator,
} from "./contract";

export interface ChatRequestMapperOptions<
	TReq extends ChatCompletionRequestShape<TMessage, TTools, TToolChoice>,
	TMessage,
	TTools,
	TToolChoice,
> {
	negotiator: CompatibilityNegotiator;
	factory: ChatRequestFactory<TReq>;
	messages: ChatMessageMapper<TMessage>;
	tools: ChatToolMapper<TTools>;
	toolChoice: ChatToolChoiceMapper<TTools, TToolChoice>;
	options: ChatRequestOptionsMapper<TReq>;
}

export class ChatRequestMapper<
	TReq extends ChatCompletionRequestShape<TMessage, TTools, TToolChoice>,
	TMessage,
	TTools,
	TToolChoice,
> implements RequestMapper<TReq>
{
	constructor(
		private readonly options: ChatRequestMapperOptions<
			TReq,
			TMessage,
			TTools,
			TToolChoice
		>,
	) {}

	map(ctx: ResponsesContext): TReq {
		const plan = this.options.negotiator.negotiate(ctx);
		const request = this.options.factory.create(ctx, plan);
		request.messages = this.options.messages.map(ctx, plan);

		const tools = this.options.tools.map(ctx, plan);
		if (tools !== undefined) request.tools = tools;

		const toolChoice = this.options.toolChoice.map(ctx, plan, tools);
		if (toolChoice !== undefined) request.tool_choice = toolChoice;

		this.options.options.apply(ctx, plan, request);
		return request;
	}
}
