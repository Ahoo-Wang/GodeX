import type { Provider } from "../adapter/provider";
import type { ProviderConfig } from "../config";
import type { Logger } from "../logger";

export type ProviderFactory = (
	config: ProviderConfig,
) => Provider<unknown, unknown, unknown>;

export class Registrar {
	private readonly factories = new Map<string, ProviderFactory>();
	private providers?: Map<string, Provider<unknown, unknown, unknown>>;
	private unsupportedProviders: string[] = [];

	registerFactory(name: string, factory: ProviderFactory): void {
		this.factories.set(name, factory);
	}

	hasFactory(name: string): boolean {
		return this.factories.has(name);
	}

	build(providers: Record<string, ProviderConfig>, logger?: Logger): void {
		this.providers = new Map();
		this.unsupportedProviders = [];
		for (const [name, config] of Object.entries(providers)) {
			const factory = this.factories.get(name);
			if (!factory) {
				this.unsupportedProviders.push(name);
				continue;
			}
			this.providers.set(name, factory(config));
		}
		const builtProviders = this.providers!;
		const getPayload = () => ({
			registered: [...builtProviders.keys()],
			skipped: this.unsupportedProviders,
		});
		if (this.unsupportedProviders.length > 0) {
			logger?.info("providers.built", getPayload);
			return;
		}
		logger?.debug("providers.built", getPayload);
	}

	resolve(name: string): Provider<unknown, unknown, unknown> {
		if (!this.providers) throw new Error("Registrar not built yet");
		const provider = this.providers.get(name);
		if (!provider) throw new Error(`Provider not registered: ${name}`);
		return provider;
	}

	list(): string[] {
		return [...(this.providers?.keys() ?? [])];
	}

	unsupported(): string[] {
		return [...this.unsupportedProviders];
	}

	capabilities(
		name: string,
	): Provider<unknown, unknown, unknown>["capabilities"] | undefined {
		return this.providers?.get(name)?.capabilities;
	}
}
