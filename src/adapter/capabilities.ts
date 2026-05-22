// src/adapter/capabilities.ts
// Provider capability flags, immutable set helpers, and merge/check utilities.

export interface ProviderCapabilities {
	/** Whether this provider supports streaming (SSE) responses. */
	readonly streaming: boolean;
	/** Which Responses API tool types this provider supports. */
	readonly supportedToolTypes: ReadonlySet<string>;
	/** Whether the provider supports reasoning/thinking tokens. */
	readonly reasoning: boolean;
	/** Whether the provider supports structured output (json_schema/json_object). */
	readonly structuredOutput: boolean;
	/** Whether the provider supports web search natively. */
	readonly webSearch: boolean;
	/** Whether the provider supports file/knowledge retrieval. */
	readonly fileSearch: boolean;
	/** Whether the provider supports image generation. */
	readonly imageGeneration: boolean;
	/** Whether the provider supports computer use. */
	readonly computerUse: boolean;
	/** Whether the provider supports parallel tool calls. */
	readonly parallelToolCalls: boolean;
	/** Whether the provider supports streaming tool calls. */
	readonly streamingToolCalls: boolean;
	/** Provider-specific features that don't fit the standard categories. */
	readonly features: ReadonlySet<string>;
	/** Maximum number of tools the provider accepts in a single request, or -1 for unlimited. */
	readonly maxTools: number;
}

class ImmutableReadonlySet<T> extends Set<T> {
	private sealed = false;

	constructor(values: Iterable<T>) {
		super();
		for (const value of values) {
			super.add(value);
		}
		this.sealed = true;
	}

	override add(value: T): this {
		if (this.sealed) {
			throw new TypeError("Provider capability sets are immutable");
		}
		return super.add(value);
	}

	override delete(value: T): boolean {
		if (this.sealed) {
			throw new TypeError("Provider capability sets are immutable");
		}
		return super.delete(value);
	}

	override clear(): void {
		if (this.sealed) {
			throw new TypeError("Provider capability sets are immutable");
		}
		super.clear();
	}
}

export const DEFAULT_CAPABILITIES: ProviderCapabilities = freezeCapabilities({
	streaming: true,
	supportedToolTypes: copySet(["function"]),
	reasoning: false,
	structuredOutput: false,
	webSearch: false,
	fileSearch: false,
	imageGeneration: false,
	computerUse: false,
	parallelToolCalls: false,
	streamingToolCalls: false,
	features: copySet([]),
	maxTools: -1,
});

type MutableProviderCapabilities = {
	-readonly [Key in keyof ProviderCapabilities]: ProviderCapabilities[Key];
};

function copySet<T>(value: Iterable<T>): ReadonlySet<T> {
	return new ImmutableReadonlySet(value);
}

function freezeCapabilities(
	capabilities: MutableProviderCapabilities,
): ProviderCapabilities {
	return Object.freeze(capabilities);
}

function isReadonlySet(value: unknown): value is ReadonlySet<unknown> {
	return value instanceof Set || value instanceof ImmutableReadonlySet;
}

export function mergeCapabilities(
	...overrides: Partial<ProviderCapabilities>[]
): ProviderCapabilities {
	const merged: MutableProviderCapabilities = {
		...DEFAULT_CAPABILITIES,
		supportedToolTypes: copySet(DEFAULT_CAPABILITIES.supportedToolTypes),
		features: copySet(DEFAULT_CAPABILITIES.features),
	};
	for (const override of overrides) {
		const { features, supportedToolTypes, ...rest } = override;
		Object.assign(merged, rest);
		if (supportedToolTypes !== undefined) {
			merged.supportedToolTypes = copySet(supportedToolTypes);
		}
		if (features !== undefined) {
			merged.features = copySet(features);
		}
	}
	return freezeCapabilities(merged);
}

export interface CapabilityCheckResult {
	supported: boolean;
	reason?: string;
}

export function checkCapability(
	capabilities: ProviderCapabilities,
	feature: keyof ProviderCapabilities,
): CapabilityCheckResult {
	const value = capabilities[feature];
	if (typeof value === "boolean") {
		return value
			? { supported: true }
			: {
					supported: false,
					reason: `${feature} is not supported by this provider`,
				};
	}
	if (isReadonlySet(value)) {
		return { supported: true };
	}
	if (typeof value === "number") {
		return { supported: true };
	}
	return { supported: false, reason: `unknown capability: ${feature}` };
}

export function checkToolSupport(
	capabilities: ProviderCapabilities,
	toolType: string,
): CapabilityCheckResult {
	return capabilities.supportedToolTypes.has(toolType)
		? { supported: true }
		: {
				supported: false,
				reason: `tool type "${toolType}" is not supported by this provider`,
			};
}
