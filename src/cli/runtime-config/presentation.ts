import type { GodeXConfig } from "../../config";
import { resolveDefaultSqlitePath } from "../../config";
import type { LoadedConfig } from "./load";

export function formatConfigSummary(loaded: LoadedConfig): string {
	const config = loaded.config;
	const session =
		config.session.backend === "sqlite"
			? `sqlite (${config.session.sqlite?.path ?? resolveDefaultSqlitePath()})`
			: "memory";
	return [
		`Config OK: ${loaded.path}`,
		`server: http://${config.server.host}:${config.server.port}`,
		`default provider: ${config.default_provider}`,
		`providers: ${Object.keys(config.providers).join(", ")}`,
		`session: ${session}`,
		"",
	].join("\n");
}

export function redactConfig(config: GodeXConfig): GodeXConfig {
	const redacted = structuredClone(config);
	for (const provider of Object.values(redacted.providers) as Array<{
		credentials: { api_key: string };
	}>) {
		if (provider.credentials.api_key) {
			provider.credentials.api_key = "<redacted>";
		}
	}
	return redacted;
}
