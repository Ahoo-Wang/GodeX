import yaml from "js-yaml";
import { resolveDefaultSqlitePath } from "../../config";
import type { InitConfigYamlOptions } from "./model";

export function buildConfigYaml(opts: InitConfigYamlOptions): string {
	const providers: Record<string, { api_key: string; base_url: string }> = {};
	for (const provider of opts.providers) {
		providers[provider.id] = {
			api_key: provider.apiKey,
			base_url: provider.baseUrl,
		};
	}

	const config = {
		server: {
			port: opts.port,
		},
		default_provider: opts.defaultProvider,
		providers,
		session: {
			backend: opts.sessionBackend,
			...(opts.sessionBackend === "sqlite"
				? { sqlite: { path: resolveDefaultSqlitePath() } }
				: {}),
		},
		logging: {
			level: opts.logLevel,
		},
	};

	return yaml.dump(config, { lineWidth: -1, noRefs: true });
}
