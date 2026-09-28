import type { LogLevel } from "./schema";

export const LOG_LEVELS: readonly LogLevel[] = [
	"trace",
	"debug",
	"info",
	"warn",
	"error",
];

export function positiveInteger(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		throw new Error(`${field} must be a positive integer`);
	}
	return value;
}

export function nonNegativeInteger(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new Error(`${field} must be a non-negative integer`);
	}
	return value;
}

export function validatePort(value: unknown): number {
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

export function validateHost(value: unknown): string {
	if (typeof value !== "string") {
		throw new Error(`Invalid server host: ${String(value)}`);
	}
	const host = value.trim();
	if (host === "") {
		throw new Error("Invalid server host: must be a non-empty string");
	}
	return host;
}

export function validateLogLevel(value: unknown, label: string): LogLevel {
	if (typeof value !== "string" || !LOG_LEVELS.includes(value as LogLevel)) {
		throw new Error(`Invalid ${label} level: ${String(value)}`);
	}
	return value as LogLevel;
}
