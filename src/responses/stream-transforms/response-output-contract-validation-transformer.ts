import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import {
	invalidOutputFormatMessage,
	validateResponseOutputContract,
} from "../response-output-contract-validation";
import { responseFromTerminalEvent } from "./stream-utils";

export class ResponseOutputContractValidationTransformer extends SafeTransformer<
	ResponseStreamEvent,
	ResponseStreamEvent
> {
	private rewrittenTerminal = false;

	constructor(private readonly ctx: ResponsesContext) {
		super();
	}

	protected async onTransform(
		chunk: ResponseStreamEvent,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): Promise<void> {
		if (this.rewrittenTerminal) return;

		const response = responseFromTerminalEvent(chunk);
		if (!response || response.status === "failed") {
			this.enqueue(controller, chunk);
			return;
		}

		try {
			validateResponseOutputContract(
				this.ctx,
				this.ctx.outputContract.current(),
				response,
			);
			this.enqueue(controller, chunk);
		} catch (err) {
			this.rewrittenTerminal = true;
			const failed = failedResponse(response, invalidOutputFormatMessage(err));
			this.enqueue(controller, {
				type: "response.failed",
				response: failed,
				error: failed.error,
			});
		}
	}
}

function failedResponse(
	response: ResponseObject,
	message: string,
): ResponseObject {
	return {
		...response,
		status: "failed",
		completed_at: response.completed_at ?? Math.floor(Date.now() / 1000),
		error: {
			code: "server_error",
			message,
		},
		incomplete_details: null,
	};
}
