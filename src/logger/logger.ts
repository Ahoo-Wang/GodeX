import {
	getLogger as getLogTapeLogger,
	type Logger as LogTapeLogger,
} from "@logtape/logtape";
import type { LoggingConfig, LogLevel } from "../config/schema";
import { configureLogging } from "./configure";

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

export function wrapLogTape(
	logtapeLogger: LogTapeLogger,
	configLevel: LogLevel,
): Logger {
	return {
		get level(): LogLevel {
			return configLevel;
		},
		child(bindings: Record<string, unknown>): Logger {
			return wrapLogTape(logtapeLogger.with(bindings), configLevel);
		},
		trace(event, attr) {
			logtapeLogger.trace(event, attr);
		},
		debug(event, attr) {
			logtapeLogger.debug(event, attr);
		},
		info(event, attr) {
			logtapeLogger.info(event, attr);
		},
		warn(event, attr) {
			logtapeLogger.warn(event, attr);
		},
		error(event, attr) {
			logtapeLogger.error(event, attr);
		},
	};
}

export function createLogger(config: LoggingConfig): Logger {
	const configured = configureLogging(config);
	if (!configured) {
		return createNoopLogger(config.level);
	}
	return wrapLogTape(getLogTapeLogger([]), config.level);
}
