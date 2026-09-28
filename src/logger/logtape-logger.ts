import type { Logger as LogTapeLogger } from "@logtape/logtape";
import type { Logger, LogLevel } from "./contract";

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
