import { isCommanderExit } from "./errors";
import { createProgram } from "./program";
import type { CliRuntime } from "./runtime";

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
