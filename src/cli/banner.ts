import type { SessionConfig } from "../config";
import { GODEX_BRAND_NAME } from "../version";

export interface StartupBannerOptions {
	version: string;
	env: string;
	host: string;
	port: number;
	configPath: string;
	session: SessionConfig;
	providers: string[];
}

export function formatStartupBanner(opts: StartupBannerOptions): string {
	const lines: string[] = [
		`${GODEX_BRAND_NAME} v${opts.version}`,
		``,
		`  address:   http://${opts.host}:${opts.port}`,
		`  env:       ${opts.env}`,
		`  config:    ${opts.configPath}`,
		`  providers: ${opts.providers.join(", ")}`,
		`  session:   ${formatSessionBackend(opts.session)}`,
	];
	return `${lines.join("\n")}\n\n`;
}

function formatSessionBackend(session: SessionConfig): string {
	if (session.backend === "sqlite" && session.sqlite?.path) {
		return `sqlite (${session.sqlite.path})`;
	}
	return session.backend;
}
