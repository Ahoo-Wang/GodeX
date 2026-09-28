import type { Command } from "commander";
import type { CliRuntime } from "../runtime";
import type { CliOptions } from "../runtime-config";
import { serve } from "../serve";

export function registerServeCommand(
	program: Command,
	runtime: CliRuntime,
): void {
	program
		.command("serve", { isDefault: true })
		.description("start the Responses API proxy")
		.option("--port <number>", "server port")
		.option("--host <address>", "server bind address")
		.option("--config <path>", "config file path")
		.option("--log-level <level>", "log level")
		.action((opts: CliOptions) => serve(opts, runtime));
}
