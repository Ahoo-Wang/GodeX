import type { SessionConfig } from "../config";

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

export function formatStartupBanner(opts: StartupBannerOptions): string {
	const lines: string[] = [
		`Godex v${opts.version}`,
		``,
		`  address:  http://${opts.host}:${opts.port}`,
		`  env:      ${opts.env}`,
		`  config:   ${opts.configPath}`,
		`  provider: ${opts.defaultProvider} (${opts.providers.join(", ")})`,
		`  session:  ${formatSessionBackend(opts.session)}`,
	];
	return `${lines.join("\n")}\n`;
}

function formatSessionBackend(session: SessionConfig): string {
	if (session.backend === "sqlite" && session.sqlite?.path) {
		return `sqlite (${session.sqlite.path})`;
	}
	return session.backend;
}
