import { writeFileSync } from "node:fs";
import * as clack from "@clack/prompts";
import { resolveDefaultSqlitePath } from "../config";
import { GODEX_BRAND_NAME } from "../version";
import {
	getInitProviderDefinition,
	INIT_PROVIDER_DEFINITIONS,
	type InitProviderDefinition,
	type InitProviderId,
} from "./init-providers";

interface InitOptions {
	configPath: string;
}

export async function runInit(opts: InitOptions): Promise<void> {
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
		return;
	}

	const providerConfigs: InitProviderConfig[] = [];
	for (const providerId of selectedProviders as InitProviderId[]) {
		const definition = getInitProviderDefinition(providerId);
		if (!definition) continue;
		const providerConfig = await promptProviderConfig(definition);
		if (!providerConfig) return;
		providerConfigs.push(providerConfig);
	}
	if (providerConfigs.length === 0) {
		clack.cancel("Operation cancelled");
		return;
	}

	let selectedDefaultProvider: InitProviderId | undefined;
	if (providerConfigs.length > 1) {
		const defaultProvider = await clack.select({
			message: "Default provider:",
			options: providerConfigs.map((provider) => ({
				value: provider.id,
				label: getInitProviderDefinition(provider.id)?.label ?? provider.id,
			})),
			initialValue: providerConfigs[0]?.id,
		});
		if (clack.isCancel(defaultProvider)) {
			clack.cancel("Operation cancelled");
			return;
		}
		selectedDefaultProvider = defaultProvider as InitProviderId;
	}

	const port = await clack.text({
		message: "Server port:",
		placeholder: "5678",
		defaultValue: "5678",
	});

	if (clack.isCancel(port)) {
		clack.cancel("Operation cancelled");
		return;
	}

	const sessionBackend = await clack.select({
		message: "Session backend:",
		options: [
			{ value: "sqlite", label: "SQLite" },
			{ value: "memory", label: "In-memory" },
		],
	});

	if (clack.isCancel(sessionBackend)) {
		clack.cancel("Operation cancelled");
		return;
	}

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
		return;
	}

	const yaml = buildConfigYaml({
		defaultProvider: resolveDefaultProvider(
			providerConfigs.map((provider) => provider.id),
			selectedDefaultProvider,
		),
		providers: providerConfigs,
		port: port as string,
		sessionBackend: sessionBackend as string,
		logLevel: logLevel as string,
	});

	writeFileSync(opts.configPath, yaml, "utf-8");
	clack.outro(`Created ${opts.configPath}`);
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

export interface InitProviderConfig {
	id: InitProviderId;
	apiKey: string;
	baseUrl: string;
}

export interface InitConfigYamlOptions {
	defaultProvider: string;
	providers: InitProviderConfig[];
	port: string;
	sessionBackend: string;
	logLevel: string;
}

export function buildConfigYaml(opts: InitConfigYamlOptions): string {
	const lines = [
		"server:",
		`  port: ${opts.port}`,
		"",
		`default_provider: ${opts.defaultProvider}`,
		"",
		"providers:",
	];

	for (const provider of opts.providers) {
		lines.push(`  ${provider.id}:`);
		lines.push(`    api_key: ${provider.apiKey}`);
		lines.push(`    base_url: ${provider.baseUrl}`);
	}

	lines.push("", "session:", `  backend: ${opts.sessionBackend}`);

	if (opts.sessionBackend === "sqlite") {
		lines.push("  sqlite:");
		lines.push(`    path: ${resolveDefaultSqlitePath()}`);
	}

	lines.push("", "logging:", `  level: ${opts.logLevel}`, "");

	return lines.join("\n");
}

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
