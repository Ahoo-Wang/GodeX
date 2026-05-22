import { homedir } from "node:os";
import path from "node:path";
import type { TransportTargetOptions } from "pino";
import type { LoggingConfig } from "../config/schema";

function expandHomeDir(filepath: string): string {
	if (filepath.startsWith("~/")) {
		return path.join(process.env.HOME ?? homedir(), filepath.slice(2));
	}
	return filepath;
}

export function createTransports(
	config: LoggingConfig,
): TransportTargetOptions[] {
	const transports: TransportTargetOptions[] = [];

	if (config.console?.enabled !== false) {
		const consoleLevel = config.console?.level ?? config.level;
		if (config.console?.pretty !== false) {
			transports.push({
				target: "pino-pretty",
				level: consoleLevel,
				options: {
					colorize: true,
					translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
					messageKey: "event",
				},
			});
		} else {
			transports.push({
				target: "pino/file",
				level: consoleLevel,
				options: { destination: 1 },
			});
		}
	}

	if (config.file?.enabled) {
		const fileLevel = config.file.level ?? config.level;
		const dir = expandHomeDir(config.file.dir);
		const filepath = path.join(dir, config.file.filename);

		transports.push({
			target: "pino/file",
			level: fileLevel,
			options: {
				destination: filepath,
				mkdir: true,
			},
		});
	}

	return transports;
}
