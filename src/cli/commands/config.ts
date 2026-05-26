import type { Command } from "commander";
import { createBuiltinRegistrar } from "../../providers/builtin";
import { GODEX_BRAND_NAME } from "../../version";
import type { CliRuntime } from "../runtime";
import {
	assertConfigReady,
	type CliOptions,
	formatConfigSummary,
	loadRuntimeConfig,
	redactConfig,
} from "../runtime-config";

export function registerConfigCommand(
	program: Command,
	runtime: CliRuntime,
): void {
	const config = program
		.command("config")
		.description(`inspect ${GODEX_BRAND_NAME} config`);

	config
		.command("check")
		.description("validate the effective config without starting the server")
		.option("--port <number>", "server port")
		.option("--host <address>", "server bind address")
		.option("--config <path>", "config file path")
		.option("--log-level <level>", "log level")
		.action((opts: CliOptions) => {
			const loaded = loadRuntimeConfig(opts, runtime);
			assertConfigReady(loaded.config, createBuiltinRegistrar());
			runtime.stdout?.write(formatConfigSummary(loaded));
		});

	config
		.command("print")
		.description("print the effective config with secrets redacted")
		.option("--port <number>", "server port")
		.option("--host <address>", "server bind address")
		.option("--config <path>", "config file path")
		.option("--log-level <level>", "log level")
		.action((opts: CliOptions) => {
			const loaded = loadRuntimeConfig(opts, runtime);
			runtime.stdout?.write(
				`${JSON.stringify(redactConfig(loaded.config), null, 2)}\n`,
			);
		});
}
