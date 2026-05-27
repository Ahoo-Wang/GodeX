import { resolveEnvVarsDeep } from "./env-interpolation";
import { asConfigObject } from "./raw";
import type { GodeXConfig } from "./schema";
import { parseLoggingConfig } from "./sections/logging";
import { parseModelsConfig } from "./sections/models";
import { parseProvidersConfig } from "./sections/providers";
import { parseServerConfig } from "./sections/server";
import { parseSessionConfig } from "./sections/session";
import { parseTraceConfig } from "./sections/trace";

export interface ConfigOverrides {
	port?: number;
	host?: string;
	logLevel?: string;
}

export function buildConfig(
	fileConfig: Record<string, unknown> | null,
	overrides: ConfigOverrides,
): GodeXConfig {
	const file = asConfigObject(fileConfig);
	const providers = parseProvidersConfig(
		resolveEnvVarsDeep(file.providers ?? {}),
	);
	const models = parseModelsConfig(
		file.models,
		new Set(Object.keys(providers)),
	);

	return {
		server: parseServerConfig(file.server, overrides),
		models,
		default_provider: parseDefaultProvider(file.default_provider),
		providers,
		session: parseSessionConfig(file.session),
		logging: parseLoggingConfig(file.logging, overrides.logLevel),
		trace: parseTraceConfig(file.trace),
	};
}

function parseDefaultProvider(raw: unknown): string {
	return (
		(typeof raw === "string" && raw
			? raw
			: process.env.GODEX_DEFAULT_PROVIDER) ?? "zhipu"
	);
}
