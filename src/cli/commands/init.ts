import type { Command } from "commander";
import { resolveDefaultConfigPath } from "../../config";
import { runInit } from "../init";

export function registerInitCommand(program: Command): void {
	program
		.command("init")
		.description("interactively create a godex.yaml configuration file")
		.option("--config <path>", "output file path")
		.action(async (opts: { config?: string }) => {
			await runInit({ configPath: opts.config ?? resolveDefaultConfigPath() });
		});
}
