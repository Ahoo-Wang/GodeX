import type { BuiltinFunctionToolDefinition } from "./definition";

export const SHELL_TOOL_DEFINITION = {
	name: "shell",
	description:
		"Run non-interactive terminal commands in the configured Codex shell environment. Use for repository inspection, reading or searching files, build/test loops, diagnostics, and commands that need pipes, redirects, variables, globbing, or &&. Use apply_patch for source edits.",
	parameters: {
		type: "object",
		properties: {
			commands: {
				type: "array",
				minItems: 1,
				items: { type: "string" },
				description:
					"One or more complete, non-interactive shell command strings to execute in order. Each string is passed to the configured shell exactly as written; combine steps intentionally when piping, redirecting, using variables, globbing, or &&.",
			},
			timeout_ms: {
				type: "number",
				minimum: 1,
				description:
					"Requested maximum execution time in milliseconds for the command batch. This is a model hint; the host runtime must enforce its own limits and may return partial output on timeout.",
			},
			max_output_length: {
				type: "number",
				minimum: 1,
				description:
					"Preferred maximum output length when logs may be large. Keep enough stdout and stderr to diagnose failures, especially for non-zero exits.",
			},
		},
		required: ["commands"],
		additionalProperties: false,
	},
} satisfies BuiltinFunctionToolDefinition;
