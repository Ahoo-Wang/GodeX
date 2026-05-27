import type { Provider } from "../adapter/provider";
import type { ProviderConfig } from "../config";
import { SERVER_PROVIDER_NOT_REGISTERED, ServerError } from "../error";
import type { Logger } from "../logger";
import type { ProviderDefinition } from "./definition";

export type ProviderFactory = (
	config: ProviderConfig,
) => Provider<unknown, unknown, unknown>;

export interface ProviderRegistrationResult {
	registered: string[];
	unsupported: string[];
}

export class Registrar {
	private readonly factories = new Map<string, ProviderFactory>();
	private providers = new Map<string, Provider<unknown, unknown, unknown>>();
	private unsupportedProviders: string[] = [];

	registerFactory(name: string, factory: ProviderFactory): void {
		this.factories.set(name, factory);
	}

	registerDefinition(definition: ProviderDefinition): void {
		this.registerFactory(definition.name, definition.create);
	}

	registerDefinitions(definitions: Iterable<ProviderDefinition>): void {
		for (const definition of definitions) {
			this.registerDefinition(definition);
		}
	}

	hasFactory(name: string): boolean {
		return this.factories.has(name);
	}

	registerProviders(
		providers: Record<string, ProviderConfig>,
		logger?: Logger,
	): ProviderRegistrationResult {
		const registeredProviders = new Map<
			string,
			Provider<unknown, unknown, unknown>
		>();
		const unsupportedProviders: string[] = [];
		for (const [name, config] of Object.entries(providers)) {
			const factory = this.factories.get(name);
			if (!factory) {
				unsupportedProviders.push(name);
				continue;
			}
			registeredProviders.set(name, factory(config));
		}
		this.providers = registeredProviders;
		this.unsupportedProviders = unsupportedProviders;
		const result = {
			registered: [...this.providers.keys()],
			unsupported: [...this.unsupportedProviders],
		} satisfies ProviderRegistrationResult;
		const getPayload = () => ({
			registered: result.registered,
			skipped: result.unsupported,
		});
		if (this.unsupportedProviders.length > 0) {
			logger?.info("providers.built", getPayload);
			return result;
		}
		logger?.debug("providers.built", getPayload);
		return result;
	}

	resolve(name: string): Provider<unknown, unknown, unknown> {
		const provider = this.providers.get(name);
		if (!provider)
			throw new ServerError(
				SERVER_PROVIDER_NOT_REGISTERED,
				`Provider not registered: ${name}`,
				{ provider: name },
			);
		return provider;
	}

	list(): string[] {
		return [...this.providers.keys()];
	}

	unsupported(): string[] {
		return [...this.unsupportedProviders];
	}
}
