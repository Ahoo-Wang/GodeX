import { asConfigObject } from "../raw";
import type {
	ConsoleLoggingConfig,
	FileLoggingConfig,
	LoggingConfig,
} from "../schema";
import { validateLogLevel } from "../validation";

export function parseLoggingConfig(
	raw: unknown,
	overrideLevel?: string,
): LoggingConfig {
	const logging = asConfigObject(raw);
	const rawLevel =
		overrideLevel ?? logging.level ?? process.env.GODEX_LOG_LEVEL ?? "info";
	return {
		level: validateLogLevel(rawLevel, "log"),
		console: parseConsoleLoggingConfig(logging),
		file: parseFileLoggingConfig(logging),
	};
}

function parseConsoleLoggingConfig(
	logging: Record<string, unknown>,
): ConsoleLoggingConfig | undefined {
	const raw = logging.console;
	if (typeof raw !== "object" || raw === null) return undefined;
	const c = asConfigObject(raw);
	if (c.enabled !== true) return { enabled: false };
	return {
		enabled: true,
		level:
			c.level !== undefined
				? validateLogLevel(c.level, "console log")
				: undefined,
	};
}

function parseFileLoggingConfig(
	logging: Record<string, unknown>,
): FileLoggingConfig | undefined {
	const raw = logging.file;
	if (typeof raw !== "object" || raw === null) return undefined;
	const f = asConfigObject(raw);
	if (f.enabled !== true) return undefined;
	if (typeof f.dir !== "string" || f.dir.trim() === "") {
		throw new Error(
			"logging.file.dir is required when file logging is enabled",
		);
	}
	if (typeof f.filename !== "string" || f.filename.trim() === "") {
		throw new Error(
			"logging.file.filename is required when file logging is enabled",
		);
	}
	const dir = f.dir.trim();
	const filename = f.filename.trim();
	return {
		enabled: true,
		level:
			f.level !== undefined ? validateLogLevel(f.level, "file log") : undefined,
		dir,
		filename,
		max_size: typeof f.max_size === "number" ? f.max_size : undefined,
		max_files: typeof f.max_files === "number" ? f.max_files : undefined,
	};
}
