import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { EnvVars } from "./env";
import type {
	ConsoleLoggingConfig,
	FileLoggingConfig,
	GodexConfig,
	LogLevel,
	ProviderConfig,
} from "./schema";

const LOG_LEVELS: readonly LogLevel[] = [
	"trace",
	"debug",
	"info",
	"warn",
	"error",
];

export function resolveEnvVars(value: string): string {
	return value.replace(/\$\{(\w+)\}/g, (match, name: string) => {
		return process.env[name] ?? match;
	});
}

function resolveEnvVarsDeep(obj: unknown): unknown {
	if (typeof obj === "string") return resolveEnvVars(obj);
	if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
	if (obj !== null && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = resolveEnvVarsDeep(value);
		}
		return result;
	}
	return obj;
}

/** Config file search paths, in priority order. */
export const CONFIG_SEARCH_PATHS = [
	"godex.yaml",
	join(homedir(), ".godex", "config.yaml"),
];

export function resolveDefaultConfigPath(): string {
	for (const candidate of CONFIG_SEARCH_PATHS) {
		if (existsSync(resolve(candidate))) return candidate;
	}
	// Return the first candidate as default for error messages / init
	return CONFIG_SEARCH_PATHS[0] as string;
}

export function resolveDefaultSqlitePath(): string {
	if (EnvVars.isDev) return "./data/sessions.db";
	return join(homedir(), ".godex", "data", "sessions.db");
}
export function loadConfigFromFile(
	configPath: string,
): Record<string, unknown> | null {
	const absolute = resolve(configPath);
	if (!existsSync(absolute)) return null;
	const raw = readFileSync(absolute, "utf-8");
	return yaml.load(raw) as Record<string, unknown>;
}

function validateProviders(
	raw: Record<string, unknown>,
): Record<string, ProviderConfig> {
	const result: Record<string, ProviderConfig> = {};

	for (const [name, value] of Object.entries(raw)) {
		if (typeof value !== "object" || value === null) {
			throw new Error(`Provider ${name} must be an object`);
		}
		const provider = value as Record<string, unknown>;
		const api_key =
			typeof provider.api_key === "string" ? provider.api_key : "";
		const base_url =
			typeof provider.base_url === "string" ? provider.base_url : "";

		if (!base_url) {
			throw new Error(`Provider ${name} is missing required field: base_url`);
		}

		const config: ProviderConfig = { api_key, base_url };
		if (
			provider.models &&
			typeof provider.models === "object" &&
			provider.models !== null
		) {
			config.models = validateModelMappings(
				name,
				provider.models as Record<string, unknown>,
			);
		}
		result[name] = config;
	}

	return result;
}

function validateModelMappings(
	providerName: string,
	rawModels: Record<string, unknown>,
): Record<string, string> {
	const models: Record<string, string> = {};
	for (const [alias, target] of Object.entries(rawModels)) {
		if (typeof target !== "string") {
			throw new Error(
				`Provider ${providerName} models.${alias} must be a string`,
			);
		}
		models[alias] = target;
	}
	return models;
}

export function buildConfig(
	fileConfig: Record<string, unknown> | null,
	overrides: {
		port?: number;
		host?: string;
		config?: string;
		logLevel?: string;
	},
): GodexConfig {
	const file = fileConfig ?? {};
	const server =
		typeof file.server === "object" && file.server !== null
			? (file.server as Record<string, unknown>)
			: {};
	const logging =
		typeof file.logging === "object" && file.logging !== null
			? (file.logging as Record<string, unknown>)
			: {};
	const session =
		typeof file.session === "object" && file.session !== null
			? (file.session as Record<string, unknown>)
			: {};

	const rawProviders = resolveEnvVarsDeep(file.providers ?? {});
	const providers =
		typeof rawProviders === "object" && rawProviders !== null
			? validateProviders(rawProviders as Record<string, unknown>)
			: {};

	const port =
		overrides.port !== undefined
			? validatePort(overrides.port)
			: server.port !== undefined
				? validatePort(server.port)
				: process.env.GODEX_PORT !== undefined
					? validatePort(process.env.GODEX_PORT)
					: 5678;

	const host =
		overrides.host !== undefined
			? validateHost(overrides.host)
			: server.host !== undefined
				? validateHost(server.host)
				: process.env.GODEX_HOST !== undefined
					? validateHost(process.env.GODEX_HOST)
					: "0.0.0.0";

	const idleTimeout =
		typeof server.idle_timeout === "number" ? server.idle_timeout : 0;

	const rawLevel =
		overrides.logLevel ??
		logging.level ??
		process.env.GODEX_LOG_LEVEL ??
		"info";
	const level = validateLogLevel(rawLevel, "log");

	const defaultProvider =
		(typeof file.default_provider === "string" && file.default_provider
			? file.default_provider
			: process.env.GODEX_DEFAULT_PROVIDER) ?? "zhipu";

	let sessionBackend: "memory" | "sqlite" = "memory";
	if (session.backend !== undefined) {
		if (session.backend !== "memory" && session.backend !== "sqlite") {
			throw new Error(`Invalid session backend: ${String(session.backend)}`);
		}
		sessionBackend = session.backend;
	}
	const sqliteConf =
		typeof session.sqlite === "object" && session.sqlite !== null
			? (session.sqlite as Record<string, unknown>)
			: {};
	const sqlitePath =
		typeof sqliteConf.path === "string"
			? sqliteConf.path
			: sessionBackend === "sqlite"
				? resolveDefaultSqlitePath()
				: undefined;

	return {
		server: { port, host, idle_timeout: idleTimeout },
		default_provider: defaultProvider,
		providers,
		session: {
			backend: sessionBackend,
			...(sqlitePath ? { sqlite: { path: sqlitePath } } : {}),
		},
		logging: {
			level,
			console: parseConsoleLoggingConfig(logging),
			file: parseFileLoggingConfig(logging),
		},
	};
}

function validatePort(value: unknown): number {
	const port =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim() !== ""
				? Number(value)
				: Number.NaN;
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`Invalid server port: ${String(value)}`);
	}
	return port;
}

function validateHost(value: unknown): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Invalid server host: ${String(value)}`);
	}
	return value;
}

function validateLogLevel(value: unknown, label: string): LogLevel {
	if (typeof value !== "string" || !LOG_LEVELS.includes(value as LogLevel)) {
		throw new Error(`Invalid ${label} level: ${String(value)}`);
	}
	return value as LogLevel;
}

function parseConsoleLoggingConfig(
	logging: Record<string, unknown>,
): ConsoleLoggingConfig | undefined {
	const raw = logging.console;
	if (typeof raw !== "object" || raw === null) return undefined;
	const c = raw as Record<string, unknown>;
	if (c.enabled !== true) return { enabled: false };
	return {
		enabled: true,
		level:
			c.level !== undefined
				? validateLogLevel(c.level, "console log")
				: undefined,
		pretty: typeof c.pretty === "boolean" ? c.pretty : undefined,
	};
}

function parseFileLoggingConfig(
	logging: Record<string, unknown>,
): FileLoggingConfig | undefined {
	const raw = logging.file;
	if (typeof raw !== "object" || raw === null) return undefined;
	const f = raw as Record<string, unknown>;
	if (f.enabled !== true) return undefined;
	if (typeof f.dir !== "string" || f.dir.trim() === "") {
		throw new Error(
			"logging.file.dir is required when file logging is enabled",
		);
	}
	if (typeof f.filename !== "string" || f.filename.trim() === "") {
		throw new Error(
			"logging.file.filename is required when file logging is enabled",
		);
	}
	return {
		enabled: true,
		level:
			f.level !== undefined ? validateLogLevel(f.level, "file log") : undefined,
		dir: f.dir,
		filename: f.filename,
	};
}
