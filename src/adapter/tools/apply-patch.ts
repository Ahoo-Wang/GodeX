import type { BuiltinFunctionToolDefinition } from "./definition";

export const APPLY_PATCH_TOOL_DEFINITION = {
	name: "apply_patch",
	description:
		"Edit files by applying one structured patch operation. Prefer this over shell commands for source changes; keep patches small, scoped, and based on inspected context.",
	parameters: {
		type: "object",
		properties: {
			operation: {
				type: "object",
				description:
					"One file operation: create_file or update_file requires path and diff; delete_file requires path only.",
				oneOf: [
					{
						type: "object",
						properties: {
							type: {
								type: "string",
								const: "create_file",
								description: "Create a new file.",
							},
							path: {
								type: "string",
								description:
									"Target file path, relative to the active workspace unless the runtime requires an absolute path.",
							},
							diff: {
								type: "string",
								description:
									"V4A diff representing the full file contents to create.",
							},
						},
						required: ["type", "path", "diff"],
						additionalProperties: false,
					},
					{
						type: "object",
						properties: {
							type: {
								type: "string",
								const: "update_file",
								description: "Update an existing file.",
							},
							path: {
								type: "string",
								description:
									"Target file path, relative to the active workspace unless the runtime requires an absolute path.",
							},
							diff: {
								type: "string",
								description:
									"V4A diff for the file update, with additions, deletions, or replacements. Include only the necessary changes.",
							},
						},
						required: ["type", "path", "diff"],
						additionalProperties: false,
					},
					{
						type: "object",
						properties: {
							type: {
								type: "string",
								const: "delete_file",
								description: "Delete a file.",
							},
							path: {
								type: "string",
								description:
									"Target file path, relative to the active workspace unless the runtime requires an absolute path.",
							},
						},
						required: ["type", "path"],
						additionalProperties: false,
					},
				],
			},
		},
		required: ["operation"],
		additionalProperties: false,
	},
} satisfies BuiltinFunctionToolDefinition;
