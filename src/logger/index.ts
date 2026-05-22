import type { Logger as PinoLogger, TransportTargetOptions } from "pino";
import pino from "pino";
import type { LoggingConfig, LogLevel } from "../config/schema";
import { createTransports } from "./transport";

export type { LogLevel };
export type LogAttr = Record<string, unknown> | (() => Record<string, unknown>);

export interface Logger {
	readonly level: LogLevel;
	child(bindings: Record<string, unknown>): Logger;
	trace(event: string, attr?: LogAttr): void;
	debug(event: string, attr?: LogAttr): void;
	info(event: string, attr?: LogAttr): void;
	warn(event: string, attr?: LogAttr): void;
	error(event: string, attr?: LogAttr): void;
}

function resolveAttr(attr: LogAttr | undefined): Record<string, unknown> {
	if (!attr) return {};
	return typeof attr === "function" ? attr() : attr;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	trace: 10,
	debug: 20,
	info: 30,
	warn: 40,
	error: 50,
};

export function formatTimestamp(date: Date): string {
	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
	);
}

function createNoopLogger(level: LogLevel): Logger {
	const logger: Logger = {
		level,
		child: () => logger,
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	};
	return logger;
}

export function wrapPino(pinoInstance: PinoLogger): Logger {
	function log(level: LogLevel, event: string, attr?: LogAttr): void {
		if (
			LEVEL_PRIORITY[level] < LEVEL_PRIORITY[pinoInstance.level as LogLevel]
		) {
			return;
		}
		const resolved = resolveAttr(attr);
		pinoInstance[level]({ ...resolved, event });
	}

	return {
		get level(): LogLevel {
			return pinoInstance.level as LogLevel;
		},
		child(bindings: Record<string, unknown>): Logger {
			return wrapPino(pinoInstance.child(bindings));
		},
		trace(event, attr) {
			log("trace", event, attr);
		},
		debug(event, attr) {
			log("debug", event, attr);
		},
		info(event, attr) {
			log("info", event, attr);
		},
		warn(event, attr) {
			log("warn", event, attr);
		},
		error(event, attr) {
			log("error", event, attr);
		},
	};
}

export function createPinoInstance(
	config: LoggingConfig,
	transports: TransportTargetOptions[] = createTransports(config),
): PinoLogger {
	if (transports.length === 0) {
		return pino({
			level: "silent",
			timestamp: () => `,"time":"${formatTimestamp(new Date())}"`,
		});
	}
	return pino(
		{
			level: config.level,
			timestamp: () => `,"time":"${formatTimestamp(new Date())}"`,
		},
		pino.transport({ targets: transports }),
	);
}

export function createLogger(config: LoggingConfig): Logger {
	const transports = createTransports(config);
	if (transports.length === 0) {
		return createNoopLogger(config.level);
	}
	return wrapPino(createPinoInstance(config, transports));
}
