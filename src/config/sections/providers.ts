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
		const spec = typeof provider.spec === "string" ? provider.spec.trim() : "";

		if (!spec) {
			throw new Error(
				`Legacy provider config is no longer supported: providers.${name} must declare "spec".`,
			);
		}

		const credentials = asConfigObject(provider.credentials);
		const api_key =
			typeof credentials.api_key === "string" ? credentials.api_key : "";
		const endpoint = asConfigObject(provider.endpoint);
		const base_url =
			typeof endpoint.base_url === "string" ? endpoint.base_url.trim() : "";
		const timeout_ms =
			typeof provider.timeout_ms === "number" ? provider.timeout_ms : undefined;

		result[name] = {
			spec,
			credentials: { api_key },
			...(base_url ? { endpoint: { base_url } } : {}),
			...(timeout_ms === undefined ? {} : { timeout_ms }),
		};
	}
	return result;
}
