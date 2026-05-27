import { ModelAliasCatalog, type ModelAliasEntry } from "./model-aliases";
import type { ResolvedModel } from "./model-reference";
import { parseModelSelector } from "./model-selector";

export interface ModelResolverOptions {
	defaultProvider: string;
	aliases?: Record<string, string>;
}

export class ModelResolver {
	private readonly defaultProvider: string;
	private readonly aliases: ModelAliasCatalog;

	constructor(options: ModelResolverOptions) {
		this.defaultProvider = options.defaultProvider;
		this.aliases = new ModelAliasCatalog(options.aliases);
	}

	resolve(model: unknown): ResolvedModel {
		const selector = parseModelSelector(model);

		if (selector.kind === "provider_model") {
			return selector.resolved;
		}

		return (
			this.aliases.resolveBareModel(selector.model) ?? {
				provider: this.defaultProvider,
				model: selector.model,
			}
		);
	}

	listAliases(registeredProviders?: Iterable<string>): ModelAliasEntry[] {
		return this.aliases.list(registeredProviders);
	}
}
