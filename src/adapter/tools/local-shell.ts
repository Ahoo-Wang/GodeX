import type { BuiltinFunctionToolDefinition } from "./definition";

export const LOCAL_SHELL_TOOL_DEFINITION = {
	name: "local_shell",
	description:
		"Run one local executable for Codex local_shell compatibility. Use shell instead when available for pipes, redirects, variables, globbing, or compound commands. Provide command as an argv array, not a shell string.",
	parameters: {
		type: "object",
		properties: {
			command: {
				type: "array",
				items: { type: "string" },
				description:
					'Executable and arguments as an argv array, for example ["git", "status", "--short"]; no shell parsing, pipes, redirects, variables, or &&.',
			},
			env: {
				type: "object",
				additionalProperties: { type: "string" },
				description:
					"Additional environment variables for the process. Use only string values.",
			},
			timeout_ms: {
				type: "number",
				description:
					"Requested maximum execution time in milliseconds for this process.",
			},
			user: {
				type: "string",
				description:
					"Optional local OS user identity to run the command as, when the runtime supports it.",
			},
			working_directory: {
				type: "string",
				description:
					"Directory where the process should run. Prefer the active workspace or an explicit known path.",
			},
		},
		required: ["command"],
		additionalProperties: false,
	},
} satisfies BuiltinFunctionToolDefinition;
