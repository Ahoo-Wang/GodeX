import type { ApplicationContext } from "../../context/application-context";

interface ModelListItem {
	id: string;
	object: "model";
	owned_by: string;
}

export function handleModels(app: ApplicationContext): Response {
	const data: ModelListItem[] = app.resolver
		.listAliases(app.registrar.list())
		.map((entry) => ({
			id: entry.alias,
			object: "model",
			owned_by: entry.target.provider,
		}));

	return Response.json({ object: "list", data });
}
