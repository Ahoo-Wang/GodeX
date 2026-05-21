import type { ApplicationContext } from "../../context/application-context";

export function handleModels(app: ApplicationContext): Response {
	const registeredProviders = new Set(app.registrar.list());
	const models = Object.entries(app.config.providers).flatMap(
		([provider, providerConfig]) => {
			if (!registeredProviders.has(provider)) return [];
			const mapping = providerConfig.models ?? {};
			const entries = Object.entries(mapping).map(([alias]) => ({
				id: alias,
				object: "model" as const,
				owned_by: provider,
			}));
			return entries;
		},
	);
	return Response.json({ object: "list", data: models });
}
