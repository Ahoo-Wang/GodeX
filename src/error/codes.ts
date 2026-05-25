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

// --- adapter stream domain ---
export const ADAPTER_STREAM_NOT_INITIALIZED = "adapter.stream.not_initialized";
export const ADAPTER_STREAM_ALREADY_INITIALIZED =
	"adapter.stream.already_initialized";
export const ADAPTER_STREAM_INVALID_TRANSITION =
	"adapter.stream.invalid_transition";
export const ADAPTER_STREAM_OUTPUT_BEFORE_START =
	"adapter.stream.output_before_start";
export const ADAPTER_STREAM_DELTA_AFTER_TERMINAL =
	"adapter.stream.delta_after_terminal";
export const ADAPTER_STREAM_MISSING_OPTIONS = "adapter.stream.missing_options";
export const ADAPTER_STREAM_MISSING_OUTPUT_BLOCK =
	"adapter.stream.missing_output_block";
export const ADAPTER_STREAM_INCOMPLETE_TOOL_CALL =
	"adapter.stream.incomplete_tool_call";

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
