// src/error/codes.ts

// --- bridge domain ---
export const BRIDGE_REQUEST_UNSUPPORTED_PARAMETER =
	"bridge.request.unsupported_parameter";
export const BRIDGE_REQUEST_TOOL_SKIPPED = "bridge.request.tool_skipped";
export const BRIDGE_REQUEST_UNSUPPORTED_INPUT_ITEM =
	"bridge.request.unsupported_input_item";
export const BRIDGE_REQUEST_UNSUPPORTED_INPUT_CONTENT =
	"bridge.request.unsupported_input_content";
export const BRIDGE_REQUEST_UNSUPPORTED_TOOL =
	"bridge.request.unsupported_tool";
export const BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT =
	"bridge.response.invalid_output_format";

// --- bridge stream domain ---
export const BRIDGE_STREAM_NOT_INITIALIZED = "bridge.stream.not_initialized";
export const BRIDGE_STREAM_ALREADY_INITIALIZED =
	"bridge.stream.already_initialized";
export const BRIDGE_STREAM_INVALID_TRANSITION =
	"bridge.stream.invalid_transition";
export const BRIDGE_STREAM_OUTPUT_BEFORE_START =
	"bridge.stream.output_before_start";
export const BRIDGE_STREAM_DELTA_AFTER_TERMINAL =
	"bridge.stream.delta_after_terminal";
export const BRIDGE_STREAM_MISSING_OPTIONS = "bridge.stream.missing_options";
export const BRIDGE_STREAM_MISSING_OUTPUT_BLOCK =
	"bridge.stream.missing_output_block";
export const BRIDGE_STREAM_INCOMPLETE_TOOL_CALL =
	"bridge.stream.incomplete_tool_call";

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
