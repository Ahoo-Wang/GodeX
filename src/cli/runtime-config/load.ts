import type { GodeXConfig } from "../../config";
import {
	buildConfig,
	loadConfigFromFile,
	resolveDefaultConfigPath,
} from "../../config";
import { CliError } from "../errors";
import type { CliRuntime } from "../runtime";
import type { CliOptions } from "./options";
import { parsePort } from "./options";

export interface LoadedConfig {
	path: string;
	config: GodeXConfig;
}

export function loadRuntimeConfig(
	opts: CliOptions,
	runtime: Pick<CliRuntime, "loadConfigFromFile">,
): LoadedConfig {
	const configPath = opts.config ?? resolveDefaultConfigPath();
	const fileConfig = (runtime.loadConfigFromFile ?? loadConfigFromFile)(
		configPath,
	);
	if (!fileConfig) {
		throw new CliError(
			`Config file not found: ${configPath}\nFix: pass --config <path> or run \`godex init\` to create one.`,
		);
	}

	return {
		path: configPath,
		config: buildConfig(fileConfig, {
			port: parsePort(opts.port),
			host: opts.host,
			logLevel: opts.logLevel,
		}),
	};
}
