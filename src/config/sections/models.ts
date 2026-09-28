import { asConfigObject, createConfigMap } from "../raw";
import type { ModelsConfig } from "../schema";

export function parseModelsConfig(
	raw: unknown,
	providerNames: Set<string>,
): ModelsConfig | undefined {
	if (typeof raw !== "object" || raw === null) return undefined;

	const rawModels = asConfigObject(raw);
	if (typeof rawModels.aliases !== "object" || rawModels.aliases === null) {
		return undefined;
	}

	return {
		aliases: validateModelAliases(
			rawModels.aliases as Record<string, unknown>,
			providerNames,
		),
	};
}

function validateModelAliases(
	rawAliases: Record<string, unknown>,
	providerNames: Set<string>,
): Record<string, string> {
	const aliases = createConfigMap<string>();
	for (const [alias, target] of Object.entries(rawAliases)) {
		if (alias !== "*" && alias.includes("/")) {
			throw new Error(
				`models.aliases.${alias}: alias key must not contain "/"`,
			);
		}
		if (typeof target !== "string") {
			throw new Error(`models.aliases.${alias} must be a string`);
		}
		const slashIndex = target.indexOf("/");
		if (slashIndex <= 0 || slashIndex === target.length - 1) {
			throw new Error(
				`models.aliases.${alias}: value must be "provider/model" format, got "${target}"`,
			);
		}
		const provider = target.slice(0, slashIndex);
		if (!providerNames.has(provider)) {
			throw new Error(
				`models.aliases.${alias}: provider "${provider}" is not configured`,
			);
		}
		aliases[alias] = target;
	}
	return aliases;
}
