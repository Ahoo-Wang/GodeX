import { isRecord } from "../../adapter/utils";
import type { ResponsesContext } from "../../context/responses-context";

const TEXT_CONTENT_TYPES = new Set(["input_text", "output_text"]);

export function warnUnsupportedCurrentInputContent(
	ctx: ResponsesContext,
	options: { providerLabel: string },
): void {
	const input = ctx.request.input;
	if (!Array.isArray(input)) return;

	input.forEach((item, itemIndex) => {
		if (!isRecord(item) || !Array.isArray(item.content)) return;

		item.content.forEach((part, partIndex) => {
			if (!isRecord(part) || typeof part.type !== "string") return;
			if (TEXT_CONTENT_TYPES.has(part.type)) return;

			ctx.addDiagnostic({
				code: "adapter.input.unsupported_content",
				severity: "warn",
				path: `input[${itemIndex}].content[${partIndex}]`,
				action: "ignored",
				message: `${options.providerLabel} Chat Completions accepts text-only message content; ignored Responses content type '${part.type}'.`,
				metadata: {
					provider: ctx.resolved.provider,
					model: ctx.resolved.model,
					contentType: part.type,
				},
			});
		});
	});
}
