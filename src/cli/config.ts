import type { GodeXConfig } from "../config";
import {
	buildConfig,
	loadConfigFromFile,
	resolveDefaultConfigPath,
	resolveDefaultSqlitePath,
} from "../config";

export interface CliOptions {
	config?: string;
	port?: string;
	host?: string;
	logLevel?: string;
}

export interface LoadedConfig {
	path: string;
	config: GodeXConfig;
}

export interface ConfigDiagnostic {
	message: string;
	fix?: string;
}

export class CliError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliError";
	}
}

export function loadRuntimeConfig(
	opts: CliOptions,
	runtime: {
		loadConfigFromFile?: (path: string) => Record<string, unknown> | null;
	},
): LoadedConfig {
	const configPath = opts.config ?? resolveDefaultConfigPath();
	const fileConfig = (runtime.loadConfigFromFile ?? loadConfigFromFile)(
		configPath,
	);
	if (!fileConfig) {
		throw new CliError(
			`Config file not found: ${configPath}\nFix: pass --config <path> or run \`godex init\` to create one.`,
		);
	}

	const port = parsePort(opts.port);
	return {
		path: configPath,
		config: buildConfig(fileConfig, {
			port,
			host: opts.host,
			logLevel: opts.logLevel,
		}),
	};
}

export function parsePort(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new CliError(`Invalid port: ${value}`);
	}
	return port;
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
		if (registrar && !registrar.hasFactory(name)) {
			diagnostics.push({
				message: `Provider is configured but not supported by this build: ${name}`,
				fix: `remove providers.${name} or add a provider implementation.`,
			});
		}

		if (!provider.api_key) {
			diagnostics.push({
				message: `Provider ${name} is missing api_key.`,
				fix: `set providers.${name}.api_key or reference an environment variable.`,
			});
		}

		for (const envVar of unresolvedEnvVars(provider.api_key)) {
			diagnostics.push({
				message: `providers.${name}.api_key uses unresolved environment variable ${envVar}.`,
				fix: `export ${envVar}=...`,
			});
		}
		for (const envVar of unresolvedEnvVars(provider.base_url)) {
			diagnostics.push({
				message: `providers.${name}.base_url uses unresolved environment variable ${envVar}.`,
				fix: `export ${envVar}=...`,
			});
		}
	}

	return diagnostics;
}

export function formatConfigSummary(loaded: LoadedConfig): string {
	const config = loaded.config;
	const session =
		config.session.backend === "sqlite"
			? `sqlite (${config.session.sqlite?.path ?? resolveDefaultSqlitePath()})`
			: "memory";
	return [
		`Config OK: ${loaded.path}`,
		`server: http://${config.server.host}:${config.server.port}`,
		`default provider: ${config.default_provider}`,
		`providers: ${Object.keys(config.providers).join(", ")}`,
		`session: ${session}`,
		"",
	].join("\n");
}

export function redactConfig(config: GodeXConfig): GodeXConfig {
	const redacted = structuredClone(config);
	for (const provider of Object.values(redacted.providers)) {
		if (provider.api_key) {
			provider.api_key = "<redacted>";
		}
	}
	return redacted;
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
