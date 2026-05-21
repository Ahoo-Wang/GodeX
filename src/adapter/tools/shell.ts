import type { BuiltinFunctionToolDefinition } from "./definition";

export const SHELL_TOOL_DEFINITION = {
	name: "shell",
	description:
		"Run terminal commands in the configured Codex shell environment. Use for repository inspection, build/test commands, and shell syntax such as pipes, redirects, variables, globbing, or &&.",
	parameters: {
		type: "object",
		properties: {
			commands: {
				type: "array",
				items: { type: "string" },
				description:
					"Shell command strings to run in order; each item is passed to the shell exactly as written.",
			},
			timeout_ms: {
				type: "number",
				description:
					"Requested maximum execution time in milliseconds for the command batch.",
			},
			max_output_length: {
				type: "number",
				description:
					"Maximum number of output characters to retain when command output may be large.",
			},
		},
		required: ["commands"],
		additionalProperties: false,
	},
} satisfies BuiltinFunctionToolDefinition;
