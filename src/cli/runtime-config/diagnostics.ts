import type { GodeXConfig } from "../../config";
import { CliError } from "../errors";

export interface ConfigDiagnostic {
	message: string;
	fix?: string;
}

export function assertConfigReady(
	config: GodeXConfig,
	registrar?: { hasFactory: (name: string) => boolean },
): void {
	const diagnostics = collectConfigDiagnostics(config, registrar);
	if (diagnostics.length === 0) return;

	throw new CliError(
		[
			"Config check failed:",
			...diagnostics.map((diagnostic) => {
				const fix = diagnostic.fix ? ` Fix: ${diagnostic.fix}` : "";
				return `- ${diagnostic.message}${fix}`;
			}),
		].join("\n"),
	);
}

export function collectConfigDiagnostics(
	config: GodeXConfig,
	registrar?: { hasFactory: (name: string) => boolean },
): ConfigDiagnostic[] {
	const diagnostics: ConfigDiagnostic[] = [];
	const providerNames = Object.keys(config.providers);

	if (providerNames.length === 0) {
		diagnostics.push({
			message: "No providers are configured.",
			fix: "add providers.<name> to the config file.",
		});
	}

	if (!config.providers[config.default_provider]) {
		diagnostics.push({
			message: `Default provider is not configured: ${config.default_provider}`,
			fix: "set default_provider to one of the configured providers.",
		});
	}

	if (!isValidPort(config.server.port)) {
		diagnostics.push({
			message: `Invalid server port: ${String(config.server.port)}`,
			fix: "use an integer between 1 and 65535.",
		});
	}

	for (const [name, provider] of Object.entries(config.providers)) {
		if (registrar && !registrar.hasFactory(provider.spec)) {
			diagnostics.push({
				message: `Provider is configured but not supported by this build: ${name}`,
				fix: `remove providers.${name} or add a provider implementation.`,
			});
		}

		if (!provider.credentials.api_key) {
			diagnostics.push({
				message: `Provider ${name} is missing api_key.`,
				fix: `set providers.${name}.credentials.api_key or reference an environment variable.`,
			});
		}

		for (const envVar of unresolvedEnvVars(provider.credentials.api_key)) {
			diagnostics.push({
				message: `providers.${name}.credentials.api_key uses unresolved environment variable ${envVar}.`,
				fix: `export ${envVar}=...`,
			});
		}
		for (const envVar of unresolvedEnvVars(provider.endpoint?.base_url ?? "")) {
			diagnostics.push({
				message: `providers.${name}.endpoint.base_url uses unresolved environment variable ${envVar}.`,
				fix: `export ${envVar}=...`,
			});
		}
	}

	return diagnostics;
}

function unresolvedEnvVars(value: string): string[] {
	const matches = value.matchAll(/\$\{(\w+)\}/g);
	return [...matches]
		.map((match) => match[1])
		.filter((name): name is string => Boolean(name));
}

function isValidPort(port: number): boolean {
	return Number.isInteger(port) && port >= 1 && port <= 65_535;
}
