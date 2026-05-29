import type { InitProviderId } from "./providers";

export interface InitOptions {
	configPath?: string;
}

export interface InitProviderConfig {
	id: InitProviderId;
	apiKey: string;
	baseUrl: string;
}

export interface InitConfigYamlOptions {
	defaultProvider: string;
	providers: InitProviderConfig[];
	port: number | string;
	sessionBackend: string;
	logLevel: string;
}
