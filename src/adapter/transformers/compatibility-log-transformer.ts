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
			logDiagnostics(this.ctx, {
				durationMillis: Date.now() - this.ctx.createdAt * 1000,
			});
		}
	}

	protected override async onFlush(): Promise<void> {
		if (!this.logged) {
			logDiagnostics(this.ctx, {
				durationMillis: Date.now() - this.ctx.createdAt * 1000,
			});
		}
	}
}

function isTerminalEvent(event: ResponseStreamEvent): boolean {
	switch (event.type) {
		case "response.completed":
		case "response.failed":
		case "response.incomplete":
		case "response.cancelled":
			return true;
		default:
			return false;
	}
}
