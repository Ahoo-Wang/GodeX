import { getLogger as getLogTapeLogger } from "@logtape/logtape";
import type { LoggingConfig } from "../config/schema";
import { configureLogging } from "./configure";
import type { Logger } from "./contract";
import { wrapLogTape } from "./logtape-logger";
import { createNoopLogger } from "./noop-logger";

export function createLogger(config: LoggingConfig): Logger {
	const configured = configureLogging(config);
	if (!configured) {
		return createNoopLogger(config.level);
	}
	return wrapLogTape(getLogTapeLogger([]), config.level);
}
