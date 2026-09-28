import type { BuiltinFunctionToolDefinition } from "./definition";

export const APPLY_PATCH_TOOL_DEFINITION = {
	name: "apply_patch",
	description:
		"Edit files with a structured patch operation. Prefer this over shell commands for source edits after inspecting context; choose create_file, update_file, or delete_file and keep V4A diffs small, focused, and easy for the patch harness to apply.",
	parameters: {
		type: "object",
		properties: {
			operation: {
				type: "object",
				description:
					"Exactly one patch operation: create_file, update_file, or delete_file. create_file and update_file include path plus a V4A diff; delete_file includes path only.",
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
								minLength: 1,
								description:
									"Target file path, relative to the active workspace unless the host runtime requires an absolute path. Stay inside the intended project tree.",
							},
							diff: {
								type: "string",
								minLength: 1,
								description:
									"V4A diff representing the full file contents for the new file; not a shell patch command.",
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
								minLength: 1,
								description:
									"Target file path, relative to the active workspace unless the host runtime requires an absolute path. Stay inside the intended project tree.",
							},
							diff: {
								type: "string",
								minLength: 1,
								description:
									"V4A diff describing only the necessary additions, deletions, or replacements for the existing file; not a shell patch command.",
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
								minLength: 1,
								description:
									"Target file path, relative to the active workspace unless the host runtime requires an absolute path. Delete only when requested or clearly necessary.",
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
