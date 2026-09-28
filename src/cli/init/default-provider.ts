import type { InitProviderId } from "./providers";

export function resolveDefaultProvider(
	providerIds: readonly InitProviderId[],
	selectedDefaultProvider: InitProviderId | undefined,
): InitProviderId {
	if (providerIds.length === 0) {
		throw new Error("At least one provider must be configured");
	}
	if (providerIds.length === 1) return providerIds[0] as InitProviderId;

	const defaultProvider =
		selectedDefaultProvider ?? (providerIds[0] as InitProviderId);
	if (!providerIds.includes(defaultProvider)) {
		throw new Error(`Default provider "${defaultProvider}" is not configured`);
	}
	return defaultProvider;
}
