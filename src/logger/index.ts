import type { LogLevel } from "../config/schema";

export type { LogLevel };

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
};

export type LogAttr = Record<string, unknown> | (() => Record<string, unknown>);

function toLocalTimestamp(date: Date): string {
	return date.toLocaleString();
}

function writeLog(
	level: LogLevel,
	component: string,
	event: string,
	attr: Record<string, unknown>,
): void {
	const entry: Record<string, unknown> = {
		timestamp: toLocalTimestamp(new Date()),
		level,
		component,
		event,
		attr,
	};
	process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export interface Logger {
	readonly level: LogLevel;
	readonly component: string;
	child(options: {
		component?: string;
		defaults?: Record<string, unknown>;
	}): Logger;
	trace(event: string, attr?: LogAttr): void;
	debug(event: string, attr?: LogAttr): void;
	info(event: string, attr?: LogAttr): void;
	warn(event: string, attr?: LogAttr): void;
	error(event: string, attr?: LogAttr): void;
}

export function createLogger(
	level: LogLevel,
	options?: { component?: string; defaults?: Record<string, unknown> },
): Logger {
	const component = options?.component ?? "app";
	const defaults = options?.defaults;
	const priority = LEVEL_PRIORITY[level];

	function shouldLog(msgLevel: LogLevel): boolean {
		return LEVEL_PRIORITY[msgLevel] >= priority;
	}

	function resolveAttr(attr: LogAttr | undefined): Record<string, unknown> {
		if (!attr) return {};
		return typeof attr === "function" ? attr() : attr;
	}

	function log(msgLevel: LogLevel, event: string, attr?: LogAttr): void {
		if (!shouldLog(msgLevel)) return;
		const resolved = resolveAttr(attr);
		writeLog(msgLevel, component, event, { ...defaults, ...resolved });
	}

	return {
		level,
		get component() {
			return component;
		},
		child(childOptions) {
			return createLogger(level, {
				component: childOptions.component ?? component,
				defaults: { ...defaults, ...childOptions.defaults },
			});
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
