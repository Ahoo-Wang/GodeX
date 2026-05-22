import type { ProviderConfig } from "../config";
import {
	SERVER_REQUEST_INVALID_PARAMETER,
	SERVER_REQUEST_MISSING_MODEL,
	ServerError,
} from "../error";

export interface ResolvedModel {
	provider: string;
	model: string;
}

export class ModelResolver {
	private readonly defaultProvider: string;
	private readonly providerConfigs: Record<string, ProviderConfig>;

	constructor(
		defaultProvider: string,
		providers: Record<string, ProviderConfig>,
	) {
		this.defaultProvider = defaultProvider;
		this.providerConfigs = providers;
	}

	resolve(model: unknown): ResolvedModel {
		const selector = normalizeModelSelector(model);
		const slashIndex = selector.indexOf("/");
		const provider =
			slashIndex !== -1 ? selector.slice(0, slashIndex) : this.defaultProvider;
		const modelName =
			slashIndex !== -1 ? selector.slice(slashIndex + 1) : selector;

		const config = this.providerConfigs[provider];
		const models = config?.models;
		const mapped = models?.[modelName] ?? models?.["*"];
		return { provider, model: mapped ?? modelName };
	}
}

function normalizeModelSelector(model: unknown): string {
	if (model === undefined || model === null) {
		throw new ServerError(
			SERVER_REQUEST_MISSING_MODEL,
			"Missing required field: model",
			{ parameter: "model" },
		);
	}

	if (typeof model !== "string") {
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			"model must be a string",
			{ parameter: "model" },
		);
	}

	const selector = model.trim();
	if (!selector) {
		throw new ServerError(
			SERVER_REQUEST_MISSING_MODEL,
			"Missing required field: model",
			{ parameter: "model" },
		);
	}

	const slashIndex = selector.indexOf("/");
	if (slashIndex === 0 || slashIndex === selector.length - 1) {
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			"Invalid model selector: provider and model segments must be non-empty",
			{ model, parameter: "model" },
		);
	}

	return selector;
}
