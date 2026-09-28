// src/error/index.ts

export {
	BridgeError,
	type BridgeErrorContext,
	createBridgeFailure,
} from "./bridge-error";
export * from "./codes";
export { GodeXError, toLogEntry } from "./godex-error";
export { ProviderError, type ProviderErrorContext } from "./provider-error";
export { ServerError, type ServerErrorContext } from "./server-error";
export { SessionError, type SessionErrorContext } from "./session-error";
