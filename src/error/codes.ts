// src/error/codes.ts

// --- adapter domain ---
export const ADAPTER_REQUEST_UNSUPPORTED_PARAMETER =
	"adapter.request.unsupported_parameter";
export const ADAPTER_REQUEST_TOOL_SKIPPED = "adapter.request.tool_skipped";
export const ADAPTER_REQUEST_UNSUPPORTED_INPUT_ITEM =
	"adapter.request.unsupported_input_item";
export const ADAPTER_REQUEST_UNSUPPORTED_INPUT_CONTENT =
	"adapter.request.unsupported_input_content";
export const ADAPTER_REQUEST_UNSUPPORTED_TOOL =
	"adapter.request.unsupported_tool";

// --- provider domain ---
export const PROVIDER_UPSTREAM_RATE_LIMIT = "provider.upstream.rate_limit";
export const PROVIDER_UPSTREAM_TIMEOUT = "provider.upstream.timeout";
export const PROVIDER_UPSTREAM_SERVER_ERROR = "provider.upstream.server_error";
export const PROVIDER_UPSTREAM_ERROR = "provider.upstream.error";

// --- session domain ---
export const SESSION_CHAIN_NOT_FOUND = "session.chain.not_found";
export const SESSION_CHAIN_CYCLE_DETECTED = "session.chain.cycle_detected";
export const SESSION_CHAIN_DEPTH_EXCEEDED = "session.chain.depth_exceeded";
export const SESSION_CHAIN_UNAVAILABLE = "session.chain.unavailable";
export const SESSION_CONFLICT = "session.store.conflict";

// --- server domain ---
export const SERVER_REQUEST_INVALID_JSON = "server.request.invalid_json";
export const SERVER_REQUEST_MISSING_MODEL = "server.request.missing_model";
export const SERVER_REQUEST_INVALID_PARAMETER =
	"server.request.invalid_parameter";
export const SERVER_PROVIDER_NOT_REGISTERED = "server.provider.not_registered";
export const SERVER_ERROR = "server_error";
