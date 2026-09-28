import type { BuiltinFunctionToolDefinition } from "./definition";

export const LOCAL_SHELL_TOOL_DEFINITION = {
	name: "local_shell",
	description:
		"Run exactly one local executable with an argv array and no shell parsing. Use shell when available for shell syntax, pipelines, redirects, variables, globbing, or compound commands; choose local_shell only for legacy argv-based local execution.",
	parameters: {
		type: "object",
		properties: {
			command: {
				type: "array",
				minItems: 1,
				items: { type: "string" },
				description:
					'Executable and arguments as an already split argv array, for example ["git", "status", "--short"]; no shell parsing, pipes, redirects, variable expansion, globbing, or &&.',
			},
			env: {
				type: "object",
				additionalProperties: { type: "string" },
				description:
					"Additional string environment variables for this process only. Do not rely on shell-style expansion.",
			},
			timeout_ms: {
				type: "number",
				minimum: 1,
				description:
					"Requested maximum execution time in milliseconds for this process. This is a model hint; the host runtime should enforce resource limits and report timeout output.",
			},
			user: {
				type: "string",
				description:
					"Optional local OS user identity to run the process as, only when the host runtime supports user switching.",
			},
			working_directory: {
				type: "string",
				description:
					"Directory where the process should run. Prefer the active workspace or an explicit known path inside the intended project.",
			},
		},
		required: ["command"],
		additionalProperties: false,
	},
} satisfies BuiltinFunctionToolDefinition;
