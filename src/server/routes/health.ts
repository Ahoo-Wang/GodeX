import type { ApplicationContext } from "../../context/application-context";

export function handleHealth(app: ApplicationContext): Response {
	return Response.json(
		{
			status: "ok",
			timestamp: Date.now(),
			providers: app.registrar.list(),
			unsupported_providers: app.registrar.unsupported(),
		},
		{ headers: { "Content-Type": "application/json" } },
	);
}
