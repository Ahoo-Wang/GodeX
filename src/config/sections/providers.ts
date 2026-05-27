import { asConfigObject, createConfigMap } from "../raw";
import type { ProviderConfig } from "../schema";

export function parseProvidersConfig(
	raw: unknown,
): Record<string, ProviderConfig> {
	if (typeof raw !== "object" || raw === null) return {};

	const result = createConfigMap<ProviderConfig>();
	for (const [name, value] of Object.entries(raw)) {
		if (typeof value !== "object" || value === null) {
			throw new Error(`Provider ${name} must be an object`);
		}
		const provider = asConfigObject(value);
		const api_key =
			typeof provider.api_key === "string" ? provider.api_key : "";
		const base_url =
			typeof provider.base_url === "string" ? provider.base_url.trim() : "";

		if (!base_url) {
			throw new Error(`Provider ${name} is missing required field: base_url`);
		}

		result[name] = { api_key, base_url };
	}
	return result;
}
