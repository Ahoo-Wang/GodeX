import { SafeTransformer } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import type { ResponseSessionStore } from "../../session";
import { StreamState } from "../mapper/stream-state";

export interface ResponseSessionPersistenceTransformerOptions {
	ctx: ResponsesContext;
	saveSession: (
		store: ResponseSessionStore,
		responseObject: ResponseObject,
		ctx: ResponsesContext,
	) => Promise<void>;
	buildResponseObject: (
		ctx: ResponsesContext,
		state: StreamState,
	) => ResponseObject | Promise<ResponseObject>;
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
		const ctx = this.options.ctx;
		const state = StreamState.from(ctx);
		if (!this.completedResponse && !state.completedAt) return;

		const responseObject =
			this.completedResponse ??
			(await this.options.buildResponseObject(ctx, state));
		await this.persist(responseObject);
	}

	private async persist(responseObject: ResponseObject): Promise<void> {
		if (this.persistenceAttempted) return;
		this.persistenceAttempted = true;
		const ctx = this.options.ctx;
		ctx.logger.info("responses.stream.completed", {
			status: responseObject.status,
			model: responseObject.model,
			outputCount: responseObject.output.length,
			durationMillis: Date.now() - ctx.createdAt * 1000,
		});
		try {
			await this.options.saveSession(ctx.app.sessionStore, responseObject, ctx);
		} catch (err) {
			ctx.logger.warn("session.save.stream.error", {
				request_id: ctx.requestId,
				error: String(err),
			});
		}
	}
}

function responseFromTerminalEvent(
	chunk: ResponseStreamEvent,
): ResponseObject | null {
	if (
		chunk.type !== "response.completed" &&
		chunk.type !== "response.incomplete" &&
		chunk.type !== "response.failed"
	) {
		return null;
	}
	return chunk.response ?? null;
}
