import type { ApplicationContext } from "../../context/application-context";

export function handleModels(app: ApplicationContext): Response {
	const aliases = app.config.models?.aliases ?? {};
	const registeredProviders = new Set(app.registrar.list());
	const data: { id: string; object: "model"; owned_by: string }[] = [];
	for (const [alias, target] of Object.entries(aliases)) {
		if (alias === "*") continue;
		const slashIndex = target.indexOf("/");
		if (slashIndex <= 0) continue;
		const provider = target.slice(0, slashIndex);
		if (!registeredProviders.has(provider)) continue;
		data.push({ id: alias, object: "model", owned_by: provider });
	}
	return Response.json({ object: "list", data });
}
