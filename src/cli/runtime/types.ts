import type { ServerDeps } from "../../server";

export interface Writer {
	write(message: string): unknown;
}

export interface CliRuntime {
	stdout?: Writer;
	stderr?: Writer;
	loadConfigFromFile?: (path: string) => Record<string, unknown> | null;
	startServer?: (deps: ServerDeps) => { port: number };
}

export type CliProgramRuntime = Required<
	Pick<CliRuntime, "stdout" | "stderr">
> &
	CliRuntime;
