// src/config/schema.ts

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface ServerConfig {
	port: number;
	host: string;
	idle_timeout?: number;
}

export interface ProviderConfig {
	api_key: string;
	base_url: string;
	models?: Record<string, string>;
}

export interface SessionConfig {
	backend: "memory" | "sqlite";
	sqlite?: { path: string };
}

export interface LoggingConfig {
	level: LogLevel;
}

export interface GodexConfig {
	server: ServerConfig;
	default_provider: string;
	providers: Record<string, ProviderConfig>;
	session: SessionConfig;
	logging: LoggingConfig;
}
