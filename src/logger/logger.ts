import {
	getLogger as getLogTapeLogger,
	type LogLevel as LogTapeLevel,
	type Logger as LogTapeLogger,
} from "@logtape/logtape";
import type { LoggingConfig, LogLevel } from "../config/schema";
import { configureLogging } from "./transport";

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

const TO_LOGTAPE: Record<LogLevel, LogTapeLevel> = {
	trace: "trace",
	debug: "debug",
	info: "info",
	warn: "warning",
	error: "error",
};

export function wrapLogTape(
	logtapeLogger: LogTapeLogger,
	configLevel: LogLevel,
): Logger {
	function log(level: LogLevel, event: string, attr?: LogAttr): void {
		const logtapeLevel = TO_LOGTAPE[level];
		if (!logtapeLogger.isEnabledFor(logtapeLevel)) return;
		const props = resolveAttr(attr);
		switch (logtapeLevel) {
			case "trace":
				logtapeLogger.trace(event, props);
				break;
			case "debug":
				logtapeLogger.debug(event, props);
				break;
			case "info":
				logtapeLogger.info(event, props);
				break;
			case "warning":
				logtapeLogger.warning(event, props);
				break;
			case "error":
				logtapeLogger.error(event, props);
				break;
		}
	}

	return {
		get level(): LogLevel {
			return configLevel;
		},
		child(bindings: Record<string, unknown>): Logger {
			return wrapLogTape(logtapeLogger.with(bindings), configLevel);
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

export function createLogger(config: LoggingConfig): Logger {
	const configured = configureLogging(config);
	if (!configured) {
		return createNoopLogger(config.level);
	}
	return wrapLogTape(getLogTapeLogger(["godex"]), config.level);
}
