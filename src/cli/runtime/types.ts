import type { ServerDeps } from "../../server";

export interface Writer {
	write(message: string): unknown;
}

export interface CliServerHandle {
	port?: number;
	stop?: () => void;
}

export interface CliRuntime {
	stdout?: Writer;
	stderr?: Writer;
	loadConfigFromFile?: (path: string) => Record<string, unknown> | null;
	startServer?: (deps: ServerDeps) => CliServerHandle;
}

export type CliProgramRuntime = Required<
	Pick<CliRuntime, "stdout" | "stderr">
> &
	CliRuntime;
