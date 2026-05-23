// src/error/index.ts

export { AdapterError, type AdapterErrorContext } from "./adapter-error";
export * from "./codes";
export { GodeXError, toLogEntry } from "./godex-error";
export { ProviderError, type ProviderErrorContext } from "./provider-error";
export { ServerError, type ServerErrorContext } from "./server-error";
export { SessionError, type SessionErrorContext } from "./session-error";
