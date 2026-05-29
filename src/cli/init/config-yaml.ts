import yaml from "js-yaml";
import { resolveDefaultSqlitePath } from "../../config";
import type { InitConfigYamlOptions } from "./model";
import { getInitProviderDefinition } from "./providers";

export function buildConfigYaml(opts: InitConfigYamlOptions): string {
	assertDefaultProviderRendered(opts);

	const defaultProviderDef = getInitProviderDefinition(opts.defaultProvider);
	const providers: Record<
		string,
		{
			spec: string;
			credentials: { api_key: string };
			endpoint: { base_url: string };
		}
	> = {};
	for (const provider of opts.providers) {
		providers[provider.id] = {
			spec: provider.id,
			credentials: { api_key: provider.apiKey },
			endpoint: { base_url: provider.baseUrl },
		};
	}

	const config = {
		server: {
			port: opts.port,
		},
		default_provider: opts.defaultProvider,
		providers,
		...(defaultProviderDef
			? {
					models: {
						aliases: {
							"*": `${opts.defaultProvider}/${defaultProviderDef.defaultModel}`,
						},
					},
				}
			: {}),
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

function assertDefaultProviderRendered(opts: InitConfigYamlOptions): void {
	if (opts.providers.some((provider) => provider.id === opts.defaultProvider)) {
		return;
	}
	throw new Error(
		`Default provider "${opts.defaultProvider}" is not configured`,
	);
}
