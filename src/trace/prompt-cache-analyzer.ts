import type { ResponseCreateRequest } from "../protocol/openai";
import { sha256Hex } from "./payload";
import type {
	PromptCacheAnalysisInput,
	ProviderPromptCacheRequestAnalyzer,
} from "./types";

const textEncoder = new TextEncoder();

function stableJson(value: unknown): string {
	return JSON.stringify(value);
}

function byteLength(value: string): number {
	return textEncoder.encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) =>
				isRecord(part) && typeof part.text === "string" ? part.text : "",
			)
			.join("");
	}
	return "";
}

function toolName(tool: unknown): string {
	if (!isRecord(tool)) return "unknown";
	const fn = tool.function;
	if (isRecord(fn) && typeof fn.name === "string") return fn.name;
	if (typeof tool.name === "string") return tool.name;
	return typeof tool.type === "string" ? tool.type : "unknown";
}

function hasCacheControlField(req: Record<string, unknown>): boolean {
	if ("cache_control" in req) return true;
	const messages = Array.isArray(req.messages) ? req.messages : [];
	for (const msg of messages) {
		if (!isRecord(msg)) continue;
		if ("cache_control" in msg) return true;
		const content = msg.content;
		if (Array.isArray(content)) {
			for (const part of content) {
				if (isRecord(part) && "cache_control" in part) return true;
			}
		}
	}
	return false;
}

export class ChatCompletionPromptCacheRequestAnalyzer
	implements ProviderPromptCacheRequestAnalyzer
{
	analyze(input: {
		provider: string;
		model: string;
		request: ResponseCreateRequest;
		providerRequest: unknown;
	}): PromptCacheAnalysisInput {
		const req = isRecord(input.providerRequest) ? input.providerRequest : {};
		const messages = Array.isArray(req.messages) ? req.messages : [];
		const tools = Array.isArray(req.tools) ? req.tools : [];
		const prefixParts: PromptCacheAnalysisInput["prefix_parts"] = [];
		const dynamic: PromptCacheAnalysisInput["dynamic_text_candidates"] = [];
		if (input.request.instructions) {
			dynamic.push({
				source: "instructions",
				text:
					typeof input.request.instructions === "string"
						? input.request.instructions
						: stableJson(input.request.instructions),
			});
		}
		for (const message of messages) {
			const role = isRecord(message) ? String(message.role ?? "") : "";
			const text = isRecord(message) ? contentText(message.content) : "";
			const json = stableJson(message);
			prefixParts.push({
				kind: role === "system" || role === "developer" ? role : "message",
				role,
				bytes: byteLength(json),
				hash: sha256Hex(json),
			});
			if (role === "system" || role === "developer") {
				dynamic.push({ source: "message", role, text });
			}
		}
		for (const tool of tools) {
			const json = stableJson(tool);
			prefixParts.push({
				kind: "tool",
				name: toolName(tool),
				bytes: byteLength(json),
				hash: sha256Hex(json),
			});
		}
		const prefixJson = stableJson(prefixParts.map((part) => part.hash));
		const names = tools.map(toolName);
		const toolJson = stableJson(names);
		return {
			provider: input.provider,
			model: input.model,
			requested_prompt_cache_key: input.request.prompt_cache_key,
			requested_prompt_cache_retention: input.request.prompt_cache_retention,
			prompt_cache_key:
				typeof req.prompt_cache_key === "string"
					? req.prompt_cache_key
					: undefined,
			prompt_cache_retention:
				typeof req.prompt_cache_retention === "string"
					? req.prompt_cache_retention
					: undefined,
			has_cache_control: hasCacheControlField(req),
			prefix_parts: prefixParts,
			tool_fingerprint:
				names.length > 0 ? { names, hash: sha256Hex(toolJson) } : undefined,
			static_prefix_hash: sha256Hex(prefixJson),
			static_prefix_bytes: prefixParts.reduce(
				(sum, part) => sum + part.bytes,
				0,
			),
			dynamic_text_candidates: dynamic,
		};
	}
}
