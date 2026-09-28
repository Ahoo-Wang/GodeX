import type { Logger, LogLevel } from "./contract";

export function createNoopLogger(level: LogLevel): Logger {
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
