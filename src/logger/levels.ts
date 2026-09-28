import {
	compareLogLevel,
	type LogLevel as LogTapeLevel,
} from "@logtape/logtape";
import type { LogLevel } from "../config/schema";

const TO_LOGTAPE_LEVEL: Record<LogLevel, LogTapeLevel> = {
	trace: "trace",
	debug: "debug",
	info: "info",
	warn: "warning",
	error: "error",
};

export function toLogTapeLevel(level: LogLevel): LogTapeLevel {
	return TO_LOGTAPE_LEVEL[level];
}

export function minLogTapeLevel(levels: readonly LogTapeLevel[]): LogTapeLevel {
	return levels.reduce<LogTapeLevel>(
		(lowest, level) => (compareLogLevel(lowest, level) <= 0 ? lowest : level),
		"fatal",
	);
}
