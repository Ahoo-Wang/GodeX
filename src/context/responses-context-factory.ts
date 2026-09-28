import {
	SERVER_PROVIDER_NOT_REGISTERED,
	SERVER_REQUEST_INVALID_PARAMETER,
	ServerError,
} from "../error";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResolvedModel } from "../resolver";
import type { ApplicationContext } from "./application-context";
import { createRequestIdentity } from "./request-identity";
import { ResponsesContext } from "./responses-context";
import { resolveResponsesSession } from "./responses-session";

export async function createResponsesContext(
	app: ApplicationContext,
	request: ResponseCreateRequest,
): Promise<ResponsesContext> {
	const identity = createRequestIdentity(app.logger);
	const resolved = resolveModel(app, request);
	identity.logger.debug("model.resolved", () => ({
		selector: request.model,
		provider: resolved.provider,
		model: resolved.model,
	}));

	if (!Object.hasOwn(app.config.providers, resolved.provider)) {
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			`Unknown provider: ${resolved.provider}`,
			{ provider: resolved.provider },
		);
	}

	const session = await resolveResponsesSession(app, request, identity.logger);
	const provider = resolveProvider(app, resolved.provider);

	return new ResponsesContext({
		app,
		request,
		session,
		resolved,
		provider,
		requestId: identity.requestId,
		responseId: identity.responseId,
		createdAt: identity.createdAt,
		logger: identity.logger,
	});
}

function resolveModel(
	app: ApplicationContext,
	request: ResponseCreateRequest,
): ResolvedModel {
	try {
		return app.resolver.resolve(request.model);
	} catch (err) {
		if (err instanceof ServerError) throw err;
		const cause = toError(err);
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			cause.message,
			{ model: String(request.model) },
			{ cause },
		);
	}
}

function resolveProvider(app: ApplicationContext, providerName: string) {
	try {
		return app.registrar.resolve(providerName);
	} catch (err) {
		const cause = toError(err);
		throw new ServerError(
			SERVER_PROVIDER_NOT_REGISTERED,
			`Provider is not registered: ${providerName}`,
			{ provider: providerName },
			{ cause },
		);
	}
}

function toError(err: unknown): Error {
	if (err instanceof Error) return err;
	return new Error(String(err));
}
