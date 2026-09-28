import {
	SERVER_REQUEST_INVALID_PARAMETER,
	SERVER_REQUEST_MISSING_MODEL,
	ServerError,
} from "../error";
import {
	parseProviderModelReference,
	type ResolvedModel,
} from "./model-reference";

export type ModelSelector =
	| {
			kind: "provider_model";
			selector: string;
			resolved: ResolvedModel;
	  }
	| {
			kind: "bare";
			selector: string;
			model: string;
	  };

export function parseModelSelector(model: unknown): ModelSelector {
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

	if (!selector.includes("/")) {
		return { kind: "bare", selector, model: selector };
	}

	const resolved = parseProviderModelReference(selector);
	if (!resolved) {
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			"Invalid model selector: provider and model segments must be non-empty",
			{ model, parameter: "model" },
		);
	}

	return { kind: "provider_model", selector, resolved };
}
