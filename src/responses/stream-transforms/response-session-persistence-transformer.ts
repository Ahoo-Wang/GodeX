import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import type { ResponseSessionStore } from "../../session";
import { responseFromTerminalEvent } from "./stream-utils";

export interface ResponseSessionPersistenceTransformerOptions {
	ctx: ResponsesContext;
	saveSession: (
		store: ResponseSessionStore,
		responseObject: ResponseObject,
		ctx: ResponsesContext,
	) => Promise<void>;
}

export class ResponseSessionPersistenceTransformer extends SafeTransformer<
	ResponseStreamEvent,
	ResponseStreamEvent
> {
	private persistenceAttempted = false;

	constructor(
		private readonly options: ResponseSessionPersistenceTransformerOptions,
	) {
		super();
	}

	protected async onTransform(
		chunk: ResponseStreamEvent,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): Promise<void> {
		const terminalResponse = responseFromTerminalEvent(chunk);
		this.enqueue(controller, chunk);
		if (terminalResponse) {
			await this.persist(terminalResponse);
		}
	}

	private async persist(responseObject: ResponseObject): Promise<void> {
		if (this.persistenceAttempted) return;
		this.persistenceAttempted = true;
		const ctx = this.options.ctx;
		try {
			await this.options.saveSession(ctx.app.sessionStore, responseObject, ctx);
		} catch (err) {
			ctx.logger.warn("session.save.stream.error", () => ({
				request_id: ctx.requestId,
				error: String(err),
			}));
		}
	}
}
