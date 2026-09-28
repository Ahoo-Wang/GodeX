import { Command } from "commander";
import { GODEX_VERSION } from "../version";
import {
	registerConfigCommand,
	registerInitCommand,
	registerServeCommand,
} from "./commands";
import type { CliProgramRuntime } from "./runtime";

export function createProgram(runtime: CliProgramRuntime): Command {
	const program = new Command();
	program.exitOverride();
	program.configureOutput({
		writeOut: (message) => runtime.stdout.write(message),
		writeErr: (message) => runtime.stderr.write(message),
	});
	program
		.name("godex")
		.description(
			"Make every model a Codex engine through an OpenAI-compatible Responses API gateway",
		)
		.version(GODEX_VERSION)
		.showHelpAfterError();

	registerServeCommand(program, runtime);
	registerConfigCommand(program, runtime);
	registerInitCommand(program);

	return program;
}
