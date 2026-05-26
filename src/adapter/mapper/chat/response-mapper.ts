import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseObject } from "../../../protocol/openai/responses";
import type { ResponseMapper } from "../contract";
import type {
	ChatFinishReasonMapper,
	ChatResponseAccessor,
	ChatResponseOutputMapper,
	ChatUsageMapper,
} from "./contract";
import {
	buildChatResponseObject,
	type ResponseStatusFields,
} from "./response-object-builder";

export interface ChatResponseMapperOptions<TRes, TChoice, TFinishReason> {
	accessor: ChatResponseAccessor<TRes, TChoice, TFinishReason>;
	finishReason: ChatFinishReasonMapper<TFinishReason>;
	output: ChatResponseOutputMapper<TRes>;
	usage: ChatUsageMapper<TRes>;
	outputText(output: ResponseObject["output"]): string;
	emptyChoicesStatus: ResponseStatusFields;
	nowSeconds?: () => number;
}

export class ChatResponseMapper<TRes, TChoice, TFinishReason>
	implements ResponseMapper<TRes>
{
	private readonly nowSeconds: () => number;

	constructor(
		private readonly options: ChatResponseMapperOptions<
			TRes,
			TChoice,
			TFinishReason
		>,
	) {
		this.nowSeconds =
			options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
	}

	map(ctx: ResponsesContext, result: TRes): ResponseObject {
		const choice = this.options.accessor.firstChoice(result);
		if (!choice) {
			return buildChatResponseObject(ctx, this.options.emptyChoicesStatus, {
				output: [],
				outputText: "",
				usage: null,
				completedAt: this.nowSeconds(),
			});
		}

		const output = this.options.output.map(ctx, result);
		return buildChatResponseObject(
			ctx,
			this.options.finishReason.map(
				this.options.accessor.finishReason(choice) as
					| TFinishReason
					| string
					| null
					| undefined,
			),
			{
				output,
				outputText: this.options.outputText(output),
				usage: this.options.usage.map(result) ?? null,
				completedAt: this.nowSeconds(),
			},
		);
	}
}
