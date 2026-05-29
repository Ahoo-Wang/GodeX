// ============================================================
// Responses Session Storage Types
// ============================================================

import type {
	ResponseCreateRequest,
	ResponseItem,
	ResponseObject,
	ResponseStatus,
	ResponseUsage,
} from "../protocol/openai/responses";

export type ResponseId = string;
export type ConversationId = string;

/**
 * Persisted turn for a Responses-compatible interaction.
 *
 * `previous_response_id` is a parent pointer, not a mutable conversation cursor.
 * Implementations should allow multiple child responses to reference the same
 * parent response so callers can fork history.
 */
export interface StoredResponseSession {
	/** Response ID that future requests may pass as `previous_response_id`. */
	id: ResponseId;
	/** Parent response ID, or null/undefined for the first turn in a chain. */
	previous_response_id?: ResponseId | null;
	/** Reserved for future Conversation API compatibility. */
	conversation_id?: ConversationId | null;
	/** Unix timestamp, matching Responses API `created_at` semantics. */
	created_at: number;
	/** Unix timestamp when generation completed, if available. */
	completed_at?: number | null;
	status: ResponseStatus;
	request: StoredResponseRequestSnapshot;
	response: StoredResponseSnapshot;
	metadata?: Record<string, unknown>;
}

/**
 * Minimal request data needed to rebuild provider chat context later.
 *
 * Keep this as a snapshot of API-shaped input. Provider-specific conversions
 * belong in the bridge runtime, not in the session store.
 */
export interface StoredResponseRequestSnapshot {
	input?: ResponseCreateRequest["input"];
	instructions?: ResponseCreateRequest["instructions"];
	model?: ResponseCreateRequest["model"];
	tools?: ResponseCreateRequest["tools"];
	tool_choice?: ResponseCreateRequest["tool_choice"];
	parallel_tool_calls?: ResponseCreateRequest["parallel_tool_calls"];
	reasoning?: ResponseCreateRequest["reasoning"];
	text?: ResponseCreateRequest["text"];
	truncation?: ResponseCreateRequest["truncation"];
}

/** Minimal response data needed for history reconstruction and diagnostics. */
export interface StoredResponseSnapshot {
	id: ResponseId;
	output: ResponseItem[];
	output_text?: string;
	usage?: ResponseUsage | null;
	error?: ResponseObject["error"];
	incomplete_details?: ResponseObject["incomplete_details"];
}

/** Resolved history for a request that references `previous_response_id`. */
export interface ResponseSessionSnapshot {
	/** The response ID originally requested by the caller. */
	previous_response_id: ResponseId;
	/** Stored turns ordered from oldest to newest. */
	turns: StoredResponseSession[];
	/** Convenience flattened item list derived from each turn's input and output. */
	input_items: ResponseItem[];
}

export interface ResolveResponseSessionOptions {
	/** Maximum parent hops to follow before failing with depth-exceeded. */
	max_depth?: number;
	/** Include non-completed responses when reconstructing history. */
	include_incomplete?: boolean;
}

export interface SaveResponseSessionOptions {
	/** Allow replacing an existing stored response with the same ID. */
	overwrite?: boolean;
	/** Guard against saving a response under an unexpected parent pointer. */
	expected_previous_response_id?: ResponseId | null;
}

/**
 * Storage boundary for Responses `previous_response_id` support.
 *
 * Implementations own persistence, chain traversal, cycle detection, status
 * filtering, and conflict checks. They should not translate items into
 * provider-specific chat messages.
 */
export interface ResponseSessionStore {
	/** Return one stored response by ID, or null when it is not available. */
	get(responseId: ResponseId): Promise<StoredResponseSession | null>;

	/** Persist a response snapshot after generation when the request is storable. */
	save(
		session: StoredResponseSession,
		options?: SaveResponseSessionOptions,
	): Promise<void>;

	/** Resolve a parent response chain ordered from oldest to newest. */
	resolveChain(
		previousResponseId: ResponseId,
		options?: ResolveResponseSessionOptions,
	): Promise<ResponseSessionSnapshot>;

	/** Remove one response snapshot by ID. */
	delete(responseId: ResponseId): Promise<void>;

	/** Release resources held by this store, if applicable. */
	close?(): void;
}
