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
}

export interface ModelsConfig {
	aliases?: Record<string, string>;
}

export interface SessionConfig {
	backend: "memory" | "sqlite";
	sqlite?: { path: string };
}

export interface ConsoleLoggingConfig {
	enabled: boolean;
	level?: LogLevel;
}

export interface FileLoggingConfig {
	enabled: boolean;
	level?: LogLevel;
	dir: string;
	filename: string;
	max_size?: number;
	max_files?: number;
}

export interface LoggingConfig {
	level: LogLevel;
	console?: ConsoleLoggingConfig;
	file?: FileLoggingConfig;
}

export interface TraceConfig {
	enabled: boolean;
	path: string;
	max_queue_size: number;
	flush_interval_ms: number;
	batch_size: number;
	capture_payload: boolean;
	payload_max_bytes: number;
}

export interface GodeXConfig {
	server: ServerConfig;
	default_provider: string;
	models?: ModelsConfig;
	providers: Record<string, ProviderConfig>;
	session: SessionConfig;
	logging: LoggingConfig;
	trace: TraceConfig;
}
