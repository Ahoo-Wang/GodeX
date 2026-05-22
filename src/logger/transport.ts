import { createWriteStream, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
	compareLogLevel,
	configureSync,
	type FormattedValues,
	getConsoleSink,
	getTextFormatter,
	type LogRecord,
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

function formatWithProps(values: FormattedValues): string {
	const props = values.record.properties;
	const base = `${values.timestamp} [${values.level}] ${values.category}: ${values.message}`;
	if (!props || Object.keys(props).length === 0) return base;
	return `${base} ${JSON.stringify(props)}`;
}

export function configureLogging(config: LoggingConfig): boolean {
	type SinkId = "console" | "file";
	const sinks: Partial<Record<SinkId, Sink>> = {};
	const loggerSinkIds: SinkId[] = [];
	let lowestLevel: LogTapeLevel = "fatal";

	if (config.console?.enabled !== false) {
		const consoleLevel =
			TO_LOGTAPE_LEVEL[config.console?.level ?? config.level];
		sinks.console =
			config.console?.pretty !== false
				? withFilter(
						getConsoleSink({
							formatter: getPrettyFormatter({
								timestamp: "date-time",
								timeZone: null,
								properties: true,
							}),
						}),
						consoleLevel,
					)
				: withFilter(getConsoleSink(), consoleLevel);
		loggerSinkIds.push("console");
		lowestLevel = consoleLevel;
	}

	if (config.file?.enabled) {
		const fileLevel = TO_LOGTAPE_LEVEL[config.file.level ?? config.level];
		const dir = expandHomeDir(config.file.dir);
		mkdirSync(dir, { recursive: true });
		const filepath = path.join(dir, config.file.filename);
		sinks.file = withFilter(createFileSink(filepath), fileLevel);
		loggerSinkIds.push("file");
		lowestLevel =
			compareLogLevel(lowestLevel, fileLevel) <= 0 ? lowestLevel : fileLevel;
	}

	if (loggerSinkIds.length === 0) return false;

	configureSync({
		reset: true,
		sinks: sinks as Record<SinkId, Sink>,
		loggers: [
			{ category: "godex", lowestLevel, sinks: loggerSinkIds },
			{
				category: ["logtape", "meta"],
				lowestLevel: "warning",
				sinks: loggerSinkIds,
			},
		],
	});

	return true;
}

function createFileSink(filepath: string): Sink {
	const formatter = getTextFormatter({
		timestamp: "date-time",
		timeZone: null,
		format: formatWithProps,
	});
	const stream = createWriteStream(filepath, { flags: "a" });
	return (record: LogRecord) => {
		stream.write(`${formatter(record)}\n`);
	};
}
