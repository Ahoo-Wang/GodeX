import { configureSync, resetSync, type Sink } from "@logtape/logtape";
import type { LoggingConfig } from "../config/schema";
import { buildLogSinks, type LoggerSinkId } from "./sinks";

export { resetSync };

export function configureLogging(config: LoggingConfig): boolean {
	const { sinks, sinkIds, lowestLevel } = buildLogSinks(config);

	if (sinkIds.length === 0) return false;

	configureSync({
		reset: true,
		sinks: sinks as Record<LoggerSinkId, Sink>,
		loggers: [
			{ category: [], lowestLevel, sinks: sinkIds },
			{
				category: ["logtape", "meta"],
				lowestLevel: "warning",
				sinks: sinkIds,
			},
		],
	});

	return true;
}
