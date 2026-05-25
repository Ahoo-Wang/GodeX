import type { Provider } from "../adapter/provider";
import type { ProviderConfig } from "../config";
import type { Logger } from "../logger";

export type ProviderFactory = (
	config: ProviderConfig,
) => Provider<unknown, unknown, unknown>;

export class Registrar {
	private readonly factories = new Map<string, ProviderFactory>();
	private providers = new Map<string, Provider<unknown, unknown, unknown>>();
	private unsupportedProviders: string[] = [];

	registerFactory(name: string, factory: ProviderFactory): void {
		this.factories.set(name, factory);
	}

	hasFactory(name: string): boolean {
		return this.factories.has(name);
	}

	registerProviders(
		providers: Record<string, ProviderConfig>,
		logger?: Logger,
	): void {
		this.unsupportedProviders = [];
		for (const [name, config] of Object.entries(providers)) {
			const factory = this.factories.get(name);
			if (!factory) {
				this.unsupportedProviders.push(name);
				continue;
			}
			this.providers.set(name, factory(config));
		}
		const getPayload = () => ({
			registered: [...this.providers.keys()],
			skipped: this.unsupportedProviders,
		});
		if (this.unsupportedProviders.length > 0) {
			logger?.info("providers.built", getPayload);
			return;
		}
		logger?.debug("providers.built", getPayload);
	}

	resolve(name: string): Provider<unknown, unknown, unknown> {
		const provider = this.providers.get(name);
		if (!provider) throw new Error(`Provider not registered: ${name}`);
		return provider;
	}

	list(): string[] {
		return [...this.providers.keys()];
	}

	unsupported(): string[] {
		return [...this.unsupportedProviders];
	}
}
