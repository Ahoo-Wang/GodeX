import { BRIDGE_REQUEST_UNSUPPORTED_PARAMETER, BridgeError } from "../../error";
import type { ToolNameCodec } from "../provider-spec";
import type { ToolExecutionMode } from "./tool-plan";

export interface ToolIdentity {
	readonly requestedName: string;
	readonly providerName: string;
	readonly requestedType: string;
	readonly providerType: string;
	readonly execution: ToolExecutionMode;
}

export interface ToolIdentityDeclaration {
	readonly requestedName: string;
	readonly providerName: string;
	readonly requestedType: string;
	readonly providerType: string;
	readonly execution?: ToolExecutionMode;
}

export class ToolIdentityMap {
	readonly #byProviderName = new Map<string, ToolIdentity>();

	add(identity: ToolIdentityDeclaration): void {
		const normalized: ToolIdentity = {
			...identity,
			execution: identity.execution ?? "provider",
		};
		const existing = this.#byProviderName.get(normalized.providerName);
		if (existing && !sameIdentity(existing, normalized)) {
			throw new BridgeError(
				BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
				`Multiple tools map to provider name '${normalized.providerName}'.`,
				{
					provider: "unknown",
					model: "unknown",
					parameter: "tools",
					providerName: normalized.providerName,
				},
			);
		}
		this.#byProviderName.set(normalized.providerName, normalized);
	}

	addDeclarations(declarations: readonly ToolIdentityDeclaration[]): void {
		for (const declaration of declarations) {
			this.add({
				requestedName: declaration.requestedName,
				providerName: declaration.providerName,
				requestedType: declaration.requestedType,
				providerType: declaration.providerType,
				execution: declaration.execution ?? "provider",
			});
		}
	}

	get(providerName: string): ToolIdentity | undefined {
		return this.#byProviderName.get(providerName);
	}
}

export function defaultToolNameCodec(name: string): string {
	const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
	return sanitized || "tool";
}

export const DEFAULT_TOOL_NAME_CODEC: ToolNameCodec = {
	toProviderName: defaultToolNameCodec,
	fromProviderName: (name) => name,
};

function sameIdentity(left: ToolIdentity, right: ToolIdentity): boolean {
	return (
		left.requestedName === right.requestedName &&
		left.providerName === right.providerName &&
		left.requestedType === right.requestedType &&
		left.providerType === right.providerType &&
		left.execution === right.execution
	);
}
