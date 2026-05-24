import type { ApplicationContext } from "../../context/application-context";

export function handleModels(app: ApplicationContext): Response {
	const aliases = app.config.models?.aliases ?? {};
	const data = Object.entries(aliases).map(([alias, target]) => {
		const slashIndex = target.indexOf("/");
		const provider = target.slice(0, slashIndex);
		return {
			id: alias,
			object: "model" as const,
			owned_by: provider,
		};
	});
	return Response.json({ object: "list", data });
}
