import { homedir } from "node:os";
import * as clack from "@clack/prompts";
import { CONFIG_SEARCH_PATHS } from "../../config";
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

function unwrapOrCancel<T>(value: T | symbol): T | null {
	if (clack.isCancel(value)) {
		clack.cancel("Operation cancelled");
		return null;
	}
	return value as T;
}

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

	const providerIds = unwrapOrCancel(selectedProviders);
	if (!providerIds) return null;

	const providers = await promptProviderConfigs(
		providerIds as InitProviderId[],
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

export async function promptConfigPath(): Promise<string | null> {
	const homeConfig = CONFIG_SEARCH_PATHS[1];
	const localConfig = CONFIG_SEARCH_PATHS[0];
	const homeLabel = `~${homeConfig.slice(homedir().length)}`;

	const savePath = await clack.select({
		message: "Save config to:",
		options: [
			{
				value: homeConfig,
				label: homeLabel,
				hint: "User directory (Recommended)",
			},
			{ value: localConfig, label: localConfig, hint: "Working directory" },
		],
		initialValue: homeConfig,
	});

	return unwrapOrCancel(savePath);
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

export function validateBaseUrl(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return;
	try {
		new URL(trimmed);
	} catch {
		return "Base URL must be a valid URL";
	}
}

export function validateApiKey(value: string | undefined): string | undefined {
	if (!value?.trim()) return;
}

async function promptProviderConfig(
	definition: InitProviderDefinition,
): Promise<InitProviderConfig | null> {
	const rawBaseUrl = unwrapOrCancel(
		await clack.text({
			message: `${definition.label} base URL:`,
			placeholder: definition.defaultBaseUrl,
			defaultValue: definition.defaultBaseUrl,
			validate: validateBaseUrl,
		}),
	);
	if (!rawBaseUrl) return null;

	const rawApiKey = unwrapOrCancel(
		await clack.text({
			message: `${definition.label} API key (or env var like ${definition.apiKeyPlaceholder}):`,
			placeholder: definition.apiKeyPlaceholder,
			defaultValue: definition.apiKeyPlaceholder,
			validate: validateApiKey,
		}),
	);
	if (!rawApiKey) return null;

	return {
		id: definition.id,
		apiKey: rawApiKey.trim(),
		baseUrl: rawBaseUrl.trim(),
	};
}

async function promptDefaultProvider(
	providers: InitProviderConfig[],
): Promise<InitProviderId | undefined | null> {
	if (providers.length <= 1) return undefined;

	const result = await clack.select({
		message: "Default provider:",
		options: providers.map((provider) => ({
			value: provider.id,
			label: getInitProviderDefinition(provider.id)?.label ?? provider.id,
		})),
		initialValue: providers[0]?.id,
	});

	return unwrapOrCancel(result) as InitProviderId | null;
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

	return unwrapOrCancel(sessionBackend);
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

	return unwrapOrCancel(logLevel);
}
