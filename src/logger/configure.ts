import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getRotatingFileSink } from "@logtape/file";
import {
	compareLogLevel,
	configureSync,
	getConsoleSink,
	getJsonLinesFormatter,
	type LogLevel as LogTapeLevel,
	resetSync,
	type Sink,
	withFilter,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import type { LoggingConfig, LogLevel } from "../config/schema";

function expandHomeDir(filepath: string): string {
	if (filepath.startsWith("~/")) {
		return path.join(process.env.HOME ?? homedir(), filepath.slice(2));
	}
	return filepath;
}

const TO_LOGTAPE_LEVEL: Record<LogLevel, LogTapeLevel> = {
	trace: "trace",
	debug: "debug",
	info: "info",
	warn: "warning",
	error: "error",
};

export { resetSync };

export function configureLogging(config: LoggingConfig): boolean {
	type SinkId = "console" | "file";
	const sinks: Partial<Record<SinkId, Sink>> = {};
	const loggerSinkIds: SinkId[] = [];
	let lowestLevel: LogTapeLevel = "fatal";

	if (config.console?.enabled !== false) {
		const consoleLevel =
			TO_LOGTAPE_LEVEL[config.console?.level ?? config.level];
		sinks.console = withFilter(
			getConsoleSink({
				formatter: getPrettyFormatter({
					timestamp: "date-time",
					properties: true,
					align: false,
					wordWrap: false,
					inspectOptions: { compact: true },
				}),
			}),
			consoleLevel,
		);
		loggerSinkIds.push("console");
		lowestLevel = consoleLevel;
	}

	if (config.file?.enabled) {
		const fileLevel = TO_LOGTAPE_LEVEL[config.file.level ?? config.level];
		const dir = expandHomeDir(config.file.dir);
		mkdirSync(dir, { recursive: true });
		const filepath = path.join(dir, config.file.filename);
		sinks.file = withFilter(
			getRotatingFileSink(filepath, {
				maxSize: (config.file.max_size ?? 10) * 1024 * 1024,
				maxFiles: config.file.max_files ?? 5,
				formatter: getJsonLinesFormatter({ properties: "flatten" }),
			}),
			fileLevel,
		);
		loggerSinkIds.push("file");
		lowestLevel =
			compareLogLevel(lowestLevel, fileLevel) <= 0 ? lowestLevel : fileLevel;
	}

	if (loggerSinkIds.length === 0) return false;

	configureSync({
		reset: true,
		sinks: sinks as Record<SinkId, Sink>,
		loggers: [
			{ category: [], lowestLevel, sinks: loggerSinkIds },
			{
				category: ["logtape", "meta"],
				lowestLevel: "warning",
				sinks: loggerSinkIds,
			},
		],
	});

	return true;
}
