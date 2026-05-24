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
	private readonly aliases: Record<string, string>;

	constructor(defaultProvider: string, aliases?: Record<string, string>) {
		this.defaultProvider = defaultProvider;
		this.aliases = aliases ?? {};
	}

	resolve(model: unknown): ResolvedModel {
		const selector = normalizeModelSelector(model);

		if (selector.includes("/")) {
			const slashIndex = selector.indexOf("/");
			return {
				provider: selector.slice(0, slashIndex),
				model: selector.slice(slashIndex + 1),
			};
		}

		const aliasTarget = this.aliases[selector] ?? this.aliases["*"];

		if (aliasTarget) {
			const slashIndex = aliasTarget.indexOf("/");
			if (slashIndex > 0 && slashIndex < aliasTarget.length - 1) {
				return {
					provider: aliasTarget.slice(0, slashIndex),
					model: aliasTarget.slice(slashIndex + 1),
				};
			}
		}

		return { provider: this.defaultProvider, model: selector };
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
