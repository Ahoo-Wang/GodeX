// src/providers/zhipu/request.ts

import type { ResponsesContext } from "../../context/responses-context";
import {
	ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
	AdapterError,
} from "../../error";
import type { ResponseToolChoice } from "../../protocol/openai/responses";
import {
	assertZhipuRequestSupported,
	warnZhipuRequestDowngrades,
} from "./capabilities";
import { buildZhipuMessages } from "./messages";
import type { ChatCompletionTextRequest } from "./protocol/completions";
import type { TextModel } from "./protocol/models";
import { mapToolChoice, mapTools } from "./tools";

export function buildZhipuRequest(
	ctx: ResponsesContext,
): ChatCompletionTextRequest {
	const req = ctx.request;
	assertZhipuRequestSupported(req, ctx.resolved.provider, ctx.resolved.model);
	warnZhipuRequestDowngrades(ctx);

	const result: ChatCompletionTextRequest = {
		model: ctx.resolved.model as TextModel,
		messages: buildZhipuMessages(req, ctx.session),
	};

	if (req.stream) result.stream = true;
	if (req.temperature !== undefined)
		result.temperature = Math.min(Math.max(req.temperature, 0), 1.0);
	if (req.top_p !== undefined) result.top_p = req.top_p;
	if (req.max_output_tokens !== undefined)
		result.max_tokens = req.max_output_tokens;
	const userId = req.safety_identifier ?? req.user;
	if (userId) result.user_id = userId;

	const requestedToolChoice = req.tool_choice as ResponseToolChoice | undefined;
	const toolsDisabled = requestedToolChoice === "none";
	const tools = toolsDisabled
		? []
		: mapTools(req.tools, {
				supportedToolTypes: ctx.provider.capabilities.supportedToolTypes,
				unsupported: "skip",
				onUnsupported: (type) => {
					ctx.logger.warn("provider.tool.skipped", () => ({
						request_id: ctx.requestId,
						toolType: type,
					}));
				},
			});
	if (tools.length > 0) {
		assertMappedToolCapacity(tools.length, ctx);
		result.tools = tools;
	}
	if (shouldWarnToolChoiceDowngrade(requestedToolChoice)) {
		ctx.logger.warn("provider.parameter.downgraded", () => ({
			request_id: ctx.requestId,
			field: "tool_choice",
			strategy: "auto",
			reason: "Zhipu Chat Completions only supports auto tool choice.",
		}));
	}
	const choice = mapToolChoice(requestedToolChoice);
	if (choice && tools.length > 0) result.tool_choice = choice;

	if (req.reasoning?.effort && req.reasoning.effort !== "none") {
		result.thinking = { type: "enabled" };
	}

	if (
		req.text?.format?.type === "json_schema" ||
		req.text?.format?.type === "json_object"
	) {
		result.response_format = { type: "json_object" };
	}

	return result;
}

function shouldWarnToolChoiceDowngrade(
	choice: ResponseToolChoice | undefined,
): boolean {
	return choice !== undefined && choice !== "auto" && choice !== "none";
}

function assertMappedToolCapacity(
	toolCount: number,
	ctx: ResponsesContext,
): void {
	const { maxTools } = ctx.provider.capabilities;
	if (maxTools < 0 || toolCount <= maxTools) return;

	throw new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
		`Zhipu accepts at most ${maxTools} mapped tools; received ${toolCount}.`,
		{
			provider: ctx.resolved.provider,
			model: ctx.resolved.model,
			parameter: "tools",
			maxTools,
			toolCount,
		},
	);
}
