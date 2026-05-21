import { Command } from "commander";
import { createBuiltinRegistrar } from "../providers/builtin";
import type { ServerDeps } from "../server";
import { GODEX_VERSION } from "../version";
import type { CliOptions } from "./config";
import {
	assertConfigReady,
	formatConfigSummary,
	loadRuntimeConfig,
	redactConfig,
} from "./config";
import { runInit } from "./init";
import { serve } from "./serve";

export interface Writer {
	write(message: string): unknown;
}

export interface CliRuntime {
	stdout?: Writer;
	stderr?: Writer;
	loadConfigFromFile?: (path: string) => Record<string, unknown> | null;
	startServer?: (deps: ServerDeps) => { port: number };
}

export async function runCli(
	argv: string[] = process.argv,
	runtime: CliRuntime = {},
): Promise<number> {
	const stdout = runtime.stdout ?? process.stdout;
	const stderr = runtime.stderr ?? process.stderr;
	const program = createProgram({ ...runtime, stdout, stderr });

	try {
		await program.parseAsync(argv, { from: "node" });
		return 0;
	} catch (err) {
		if (isCommanderExit(err)) {
			return err.exitCode;
		}
		const message = err instanceof Error ? err.message : String(err);
		stderr.write(`Error: ${message}\n`);
		return 1;
	}
}

function createProgram(
	runtime: Required<Pick<CliRuntime, "stdout" | "stderr">> & CliRuntime,
): Command {
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

	addServeCommand(program, runtime);
	addConfigCommand(program, runtime);

	program
		.command("init")
		.description("interactively create a godex.yaml configuration file")
		.option("--config <path>", "output file path")
		.action(async (opts: { config?: string }) => {
			const { resolveDefaultConfigPath } = await import("../config");
			await runInit({ configPath: opts.config ?? resolveDefaultConfigPath() });
		});

	return program;
}

function addServeCommand(program: Command, runtime: CliRuntime): void {
	program
		.command("serve", { isDefault: true })
		.description("start the Responses API proxy")
		.option("--port <number>", "server port")
		.option("--host <address>", "server bind address")
		.option("--config <path>", "config file path")
		.option("--log-level <level>", "log level")
		.action((opts: CliOptions) => serve(opts, runtime));
}

function addConfigCommand(program: Command, runtime: CliRuntime): void {
	const config = program.command("config").description("inspect Godex config");

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

function isCommanderExit(err: unknown): err is { exitCode: number } {
	return (
		typeof err === "object" &&
		err !== null &&
		"exitCode" in err &&
		typeof (err as { exitCode: unknown }).exitCode === "number"
	);
}
