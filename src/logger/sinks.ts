import { mkdirSync } from "node:fs";
import path from "node:path";
import { getRotatingFileSink } from "@logtape/file";
import {
	getConsoleSink,
	getJsonLinesFormatter,
	type LogLevel as LogTapeLevel,
	type Sink,
	withFilter,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import type { LoggingConfig } from "../config/schema";
import { minLogTapeLevel, toLogTapeLevel } from "./levels";
import { expandHomeDir } from "./paths";

export type LoggerSinkId = "console" | "file";

export interface LogSinkBuildResult {
	sinks: Partial<Record<LoggerSinkId, Sink>>;
	sinkIds: LoggerSinkId[];
	lowestLevel: LogTapeLevel;
}

export function buildLogSinks(config: LoggingConfig): LogSinkBuildResult {
	const sinks: Partial<Record<LoggerSinkId, Sink>> = {};
	const sinkIds: LoggerSinkId[] = [];
	const levels: LogTapeLevel[] = [];

	if (config.console?.enabled !== false) {
		const consoleLevel = toLogTapeLevel(config.console?.level ?? config.level);
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
		sinkIds.push("console");
		levels.push(consoleLevel);
	}

	if (config.file?.enabled) {
		const fileLevel = toLogTapeLevel(config.file.level ?? config.level);
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
		sinkIds.push("file");
		levels.push(fileLevel);
	}

	return {
		sinks,
		sinkIds,
		lowestLevel: minLogTapeLevel(levels),
	};
}
