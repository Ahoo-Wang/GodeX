import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import type { ResponseSessionStore } from "../../session";
import {
	StreamResponsePhase,
	StreamResponseState,
} from "../mapper/stream-response-state";
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
	private completedResponse?: ResponseObject;
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
		if (terminalResponse) {
			this.completedResponse = terminalResponse;
		}
		this.enqueue(controller, chunk);
		if (terminalResponse) {
			await this.persist(terminalResponse);
		}
	}

	protected override async onFlush(): Promise<void> {
		if (this.completedResponse) return;

		const state = StreamResponseState.get(this.options.ctx);
		if (!state) return;
		if (
			state.phase !== StreamResponsePhase.COMPLETED &&
			state.phase !== StreamResponsePhase.INCOMPLETE &&
			state.phase !== StreamResponsePhase.FAILED
		) {
			return;
		}
		await this.persist(state.snapshot);
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
