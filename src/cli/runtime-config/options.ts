import { CliError } from "../errors";

export interface CliOptions {
	config?: string;
	port?: string;
	host?: string;
	logLevel?: string;
}

export function parsePort(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new CliError(`Invalid port: ${value}`);
	}
	return port;
}
