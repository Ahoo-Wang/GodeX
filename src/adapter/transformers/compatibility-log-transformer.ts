import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import { logDiagnostics } from "../compatibility";

export class CompatibilityLogTransformer extends SafeTransformer<
	ResponseStreamEvent,
	ResponseStreamEvent
> {
	private logged = false;

	constructor(private readonly ctx: ResponsesContext) {
		super();
	}

	protected async onTransform(
		chunk: ResponseStreamEvent,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): Promise<void> {
		this.enqueue(controller, chunk);
		if (!this.logged && isTerminalEvent(chunk)) {
			this.logged = true;
			logDiagnostics(this.ctx);
		}
	}

	protected override async onFlush(): Promise<void> {
		if (!this.logged) {
			logDiagnostics(this.ctx);
		}
	}
}

function isTerminalEvent(event: ResponseStreamEvent): boolean {
	switch (event.type) {
		case "response.completed":
		case "response.failed":
		case "response.incomplete":
			return true;
		default:
			return false;
	}
}
