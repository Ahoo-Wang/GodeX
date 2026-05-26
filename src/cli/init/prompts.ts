import * as clack from "@clack/prompts";
import { GODEX_BRAND_NAME } from "../../version";
import { parsePort } from "../runtime-config";
import { resolveDefaultProvider } from "./default-provider";
import type { InitConfigYamlOptions, InitProviderConfig } from "./model";
import {
	getInitProviderDefinition,
	INIT_PROVIDER_DEFINITIONS,
	type InitProviderDefinition,
	type InitProviderId,
} from "./providers";

export async function promptInitConfig(): Promise<InitConfigYamlOptions | null> {
	clack.intro(`${GODEX_BRAND_NAME} Configuration Wizard`);

	const selectedProviders = await clack.multiselect({
		message: "Which LLM providers do you want to configure?",
		options: INIT_PROVIDER_DEFINITIONS.map((provider) => ({
			value: provider.id,
			label: provider.label,
		})),
		required: true,
	});

	if (clack.isCancel(selectedProviders)) {
		clack.cancel("Operation cancelled");
		return null;
	}

	const providers = await promptProviderConfigs(
		selectedProviders as InitProviderId[],
	);
	if (!providers) return null;

	const selectedDefaultProvider = await promptDefaultProvider(providers);
	if (selectedDefaultProvider === null) return null;

	const port = await promptServerPort();
	if (port === null) return null;

	const sessionBackend = await promptSessionBackend();
	if (sessionBackend === null) return null;

	const logLevel = await promptLogLevel();
	if (logLevel === null) return null;

	return {
		defaultProvider: resolveDefaultProvider(
			providers.map((provider) => provider.id),
			selectedDefaultProvider,
		),
		providers,
		port,
		sessionBackend,
		logLevel,
	};
}

async function promptProviderConfigs(
	providerIds: InitProviderId[],
): Promise<InitProviderConfig[] | null> {
	const providerConfigs: InitProviderConfig[] = [];
	for (const providerId of providerIds) {
		const definition = getInitProviderDefinition(providerId);
		if (!definition) continue;
		const providerConfig = await promptProviderConfig(definition);
		if (!providerConfig) return null;
		providerConfigs.push(providerConfig);
	}
	if (providerConfigs.length > 0) return providerConfigs;

	clack.cancel("Operation cancelled");
	return null;
}

async function promptProviderConfig(
	definition: InitProviderDefinition,
): Promise<InitProviderConfig | null> {
	const apiKey = await clack.text({
		message: `${definition.label} API key (or env var like ${definition.apiKeyPlaceholder}):`,
		placeholder: definition.apiKeyPlaceholder,
		defaultValue: definition.apiKeyPlaceholder,
	});

	if (clack.isCancel(apiKey)) {
		clack.cancel("Operation cancelled");
		return null;
	}

	const baseUrl = await clack.select({
		message: `${definition.label} base URL:`,
		options: definition.baseUrlChoices,
		initialValue: definition.defaultBaseUrl,
	});

	if (clack.isCancel(baseUrl)) {
		clack.cancel("Operation cancelled");
		return null;
	}

	return {
		id: definition.id,
		apiKey: apiKey as string,
		baseUrl: baseUrl as string,
	};
}

async function promptDefaultProvider(
	providers: InitProviderConfig[],
): Promise<InitProviderId | undefined | null> {
	if (providers.length <= 1) return undefined;

	const defaultProvider = await clack.select({
		message: "Default provider:",
		options: providers.map((provider) => ({
			value: provider.id,
			label: getInitProviderDefinition(provider.id)?.label ?? provider.id,
		})),
		initialValue: providers[0]?.id,
	});
	if (clack.isCancel(defaultProvider)) {
		clack.cancel("Operation cancelled");
		return null;
	}
	return defaultProvider as InitProviderId;
}

async function promptServerPort(): Promise<number | null> {
	const port = await clack.text({
		message: "Server port:",
		placeholder: "5678",
		defaultValue: "5678",
	});

	if (clack.isCancel(port)) {
		clack.cancel("Operation cancelled");
		return null;
	}
	try {
		return parsePort(port as string) ?? 5678;
	} catch (err) {
		clack.cancel(err instanceof Error ? err.message : String(err));
		return null;
	}
}

async function promptSessionBackend(): Promise<string | null> {
	const sessionBackend = await clack.select({
		message: "Session backend:",
		options: [
			{ value: "sqlite", label: "SQLite" },
			{ value: "memory", label: "In-memory" },
		],
	});

	if (clack.isCancel(sessionBackend)) {
		clack.cancel("Operation cancelled");
		return null;
	}
	return sessionBackend as string;
}

async function promptLogLevel(): Promise<string | null> {
	const logLevel = await clack.select({
		message: "Log level:",
		options: [
			{ value: "debug", label: "debug" },
			{ value: "info", label: "info" },
			{ value: "warn", label: "warn" },
		],
		initialValue: "info",
	});

	if (clack.isCancel(logLevel)) {
		clack.cancel("Operation cancelled");
		return null;
	}
	return logLevel as string;
}
