import type { ResponsesContext } from "../../context/responses-context";
import {
	ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
	AdapterError,
} from "../../error";
import type { ResponseCreateRequest } from "../../protocol/openai/responses";

export function assertZhipuRequestSupported(
	req: ResponseCreateRequest,
	provider: string,
	model: string,
): void {
	rejectWhen(
		req.background === true,
		"background",
		"background responses are not supported by the Zhipu Chat Completions adapter.",
		provider,
		model,
	);
	rejectWhen(
		req.conversation !== undefined,
		"conversation",
		"conversation lifecycle support is not implemented; use previous_response_id instead.",
		provider,
		model,
	);
	rejectWhen(
		req.prompt !== undefined,
		"prompt",
		"prompt templates must be resolved before reaching the provider adapter.",
		provider,
		model,
	);
}

export function warnZhipuRequestDowngrades(ctx: ResponsesContext): void {
	if (ctx.request.truncation === "auto") {
		ctx.addDiagnostic({
			code: "adapter.param.unsupported",
			severity: "warn",
			path: "truncation",
			action: "ignored",
			message:
				"Automatic context truncation is not implemented; forwarding without truncation.",
			metadata: { parameter: "truncation", value: ctx.request.truncation },
		});
	}
	if (ctx.request.parallel_tool_calls !== undefined) {
		ctx.addDiagnostic({
			code: "adapter.param.unsupported",
			severity: "warn",
			path: "parallel_tool_calls",
			action: "ignored",
			message:
				"Zhipu Chat Completions does not expose parallel tool-call control.",
			metadata: {
				parameter: "parallel_tool_calls",
				value: ctx.request.parallel_tool_calls,
			},
		});
	}
}

function rejectWhen(
	condition: boolean,
	field: string,
	message: string,
	provider: string,
	model: string,
): void {
	if (!condition) return;
	throw new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
		`Unsupported Responses parameter for Zhipu: ${field}. ${message}`,
		{ provider, model, parameter: field },
	);
}
