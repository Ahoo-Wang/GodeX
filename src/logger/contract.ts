import type { LogLevel } from "../config/schema";

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
