import type { SessionConfig } from "../config";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function colorEnv(env: string): string {
	if (env === "prod") return `${GREEN}${env}${RESET}`;
	if (env === "dev") return `${YELLOW}${env}${RESET}`;
	return env;
}

function shouldColorize(): boolean {
	return process.stdout.isTTY ?? false;
}

export interface StartupBannerOptions {
	version: string;
	env: string;
	host: string;
	port: number;
	configPath: string;
	session: SessionConfig;
	defaultProvider: string;
	providers: string[];
}

export function formatStartupBanner(
	opts: StartupBannerOptions,
	color?: boolean,
): string {
	const useColor = color ?? shouldColorize();
	const lines: string[] = [
		useColor
			? `${BOLD}${CYAN}Godex${RESET} v${opts.version}`
			: `Godex v${opts.version}`,
		``,
		`  ${useColor ? DIM : ""}address:${useColor ? RESET : ""}  http://${opts.host}:${opts.port}`,
		`  ${useColor ? DIM : ""}env:${useColor ? RESET : ""}      ${useColor ? colorEnv(opts.env) : opts.env}`,
		`  ${useColor ? DIM : ""}config:${useColor ? RESET : ""}   ${opts.configPath}`,
		`  ${useColor ? DIM : ""}provider:${useColor ? RESET : ""} ${opts.defaultProvider} (${opts.providers.join(", ")})`,
		`  ${useColor ? DIM : ""}session:${useColor ? RESET : ""}  ${formatSessionBackend(opts.session)}`,
	];
	return `${lines.join("\n")}\n`;
}

function formatSessionBackend(session: SessionConfig): string {
	if (session.backend === "sqlite" && session.sqlite?.path) {
		return `sqlite (${session.sqlite.path})`;
	}
	return session.backend;
}
