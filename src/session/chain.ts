import {
	SESSION_CHAIN_CYCLE_DETECTED,
	SESSION_CHAIN_DEPTH_EXCEEDED,
	SESSION_CHAIN_NOT_FOUND,
	SESSION_CHAIN_UNAVAILABLE,
	SessionError,
} from "../error";
import type { ResponseItem } from "../protocol/openai/responses";
import type {
	ResolveResponseSessionOptions,
	ResponseId,
	ResponseSessionSnapshot,
	StoredResponseRequestSnapshot,
	StoredResponseSession,
} from "./types";

const DEFAULT_MAX_DEPTH = 64;

export interface ResolveResponseSessionChainOptions
	extends ResolveResponseSessionOptions {
	get(
		responseId: ResponseId,
	): StoredResponseSession | null | Promise<StoredResponseSession | null>;
}

export async function resolveResponseSessionChain(
	previousResponseId: ResponseId,
	options: ResolveResponseSessionChainOptions,
): Promise<ResponseSessionSnapshot> {
	const maxDepth = options.max_depth ?? DEFAULT_MAX_DEPTH;
	const includeIncomplete = options.include_incomplete ?? false;
	const visited = new Set<ResponseId>();
	const turns: StoredResponseSession[] = [];

	let responseId: ResponseId | null | undefined = previousResponseId;
	while (responseId) {
		if (turns.length >= maxDepth) {
			throw new SessionError(
				SESSION_CHAIN_DEPTH_EXCEEDED,
				"Previous response chain exceeded the configured max depth.",
				{
					responseId,
					previousResponseId,
					maxDepth,
				},
			);
		}

		if (visited.has(responseId)) {
			throw new SessionError(
				SESSION_CHAIN_CYCLE_DETECTED,
				"Previous response chain contains a cycle.",
				{
					responseId,
					previousResponseId,
				},
			);
		}
		visited.add(responseId);

		const turn = await options.get(responseId);
		if (!turn) {
			throw new SessionError(
				SESSION_CHAIN_NOT_FOUND,
				"Previous response was not found.",
				{
					responseId,
					previousResponseId,
				},
			);
		}

		if (!includeIncomplete && turn.status !== "completed") {
			throw new SessionError(
				SESSION_CHAIN_UNAVAILABLE,
				"Previous response is not completed and cannot be used as context.",
				{
					responseId,
					previousResponseId,
				},
			);
		}

		turns.push(turn);
		responseId = turn.previous_response_id;
	}

	turns.reverse();

	return {
		previous_response_id: previousResponseId,
		turns,
		input_items: turns.flatMap((turn) => [
			...requestInputItems(turn.request.input),
			...turn.response.output,
		]),
	};
}

export function requestInputItems(
	input: StoredResponseRequestSnapshot["input"],
): ResponseItem[] {
	if (!input) {
		return [];
	}

	if (typeof input === "string") {
		return [
			{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: input }],
			},
		];
	}

	return input as ResponseItem[];
}
