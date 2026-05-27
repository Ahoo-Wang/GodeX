import {
	parseProviderModelReference,
	type ResolvedModel,
} from "./model-reference";

const WILDCARD_ALIAS = "*";

export interface ModelAliasEntry {
	alias: string;
	target: ResolvedModel;
}

export class ModelAliasCatalog {
	private readonly aliases: Record<string, string>;

	constructor(aliases?: Record<string, string>) {
		this.aliases = aliases ?? {};
	}

	resolveBareModel(model: string): ResolvedModel | undefined {
		return this.parseTarget(this.aliases[model]) ?? this.parseWildcardTarget();
	}

	list(registeredProviders?: Iterable<string>): ModelAliasEntry[] {
		const providerFilter = registeredProviders
			? new Set(registeredProviders)
			: undefined;
		const entries: ModelAliasEntry[] = [];

		for (const [alias, target] of Object.entries(this.aliases)) {
			if (alias === WILDCARD_ALIAS) continue;
			const resolved = this.parseTarget(target);
			if (!resolved) continue;
			if (providerFilter && !providerFilter.has(resolved.provider)) continue;
			entries.push({ alias, target: resolved });
		}

		return entries;
	}

	private parseWildcardTarget(): ResolvedModel | undefined {
		return this.parseTarget(this.aliases[WILDCARD_ALIAS]);
	}

	private parseTarget(target: string | undefined): ResolvedModel | undefined {
		if (!target) return undefined;
		return parseProviderModelReference(target);
	}
}
