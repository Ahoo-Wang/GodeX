import { nanoid } from "nanoid";
import type { Provider } from "../adapter/provider";
import {
	SERVER_PROVIDER_NOT_REGISTERED,
	SERVER_REQUEST_INVALID_PARAMETER,
	ServerError,
	SessionError,
} from "../error";
import type { Logger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResolvedModel } from "../resolver";
import type { ResponseSessionSnapshot } from "../session";
import type { ApplicationContext } from "./application-context";

export class ResponsesContext {
	readonly responseId: string;
	readonly requestId: string;
	readonly createdAt: number;
	readonly logger: Logger;
	readonly attributes: Map<string, unknown>;

	constructor(
		readonly app: ApplicationContext,
		readonly request: ResponseCreateRequest,
		readonly session: ResponseSessionSnapshot | null,
		readonly resolved: ResolvedModel,
		readonly provider: Provider<unknown, unknown, unknown>,
	) {
		this.responseId = `resp_${nanoid()}`;
		this.requestId = `req_${nanoid()}`;
		this.createdAt = Math.floor(Date.now() / 1000);
		this.logger = app.logger.child({
			request_id: this.requestId,
			response_id: this.responseId,
		});
		this.attributes = new Map();
	}

	static async create(
		app: ApplicationContext,
		body: ResponseCreateRequest,
	): Promise<ResponsesContext> {
		let resolved: ResolvedModel;
		try {
			resolved = app.resolver.resolve(body.model);
		} catch (err) {
			if (err instanceof ServerError) throw err;
			throw new ServerError(
				SERVER_REQUEST_INVALID_PARAMETER,
				err instanceof Error ? err.message : "Failed to resolve model",
				{ model: String(body.model) },
				{ cause: err instanceof Error ? err : undefined },
			);
		}

		const providerConfig = app.config.providers[resolved.provider];
		if (!providerConfig) {
			throw new ServerError(
				SERVER_REQUEST_INVALID_PARAMETER,
				`Unknown provider: ${resolved.provider}`,
				{ provider: resolved.provider },
			);
		}

		let session: ResponseSessionSnapshot | null = null;
		if (body.previous_response_id) {
			try {
				session = await app.sessionStore.resolveChain(
					body.previous_response_id,
				);
			} catch (err) {
				if (err instanceof SessionError) throw err;
				throw err;
			}
		}

		let provider: Provider<unknown, unknown, unknown>;
		try {
			provider = app.registrar.resolve(resolved.provider);
		} catch (err) {
			throw new ServerError(
				SERVER_PROVIDER_NOT_REGISTERED,
				`Provider is not registered: ${resolved.provider}`,
				{ provider: resolved.provider },
				{ cause: err instanceof Error ? err : undefined },
			);
		}

		return new ResponsesContext(app, body, session, resolved, provider);
	}
}
