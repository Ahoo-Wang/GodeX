import { asConfigObject } from "../raw";
import type {
	WebSearchConfig,
	WebSearchMode,
	WebSearchOnUnavailable,
	WebSearchProvider,
} from "../schema";
import { positiveInteger } from "../validation";

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
	enabled: true,
	mode: "auto",
	provider: "none",
	on_unavailable: "client_tool_call",
	max_iterations: 2,
	timeout_ms: 10000,
};

const WEB_SEARCH_MODES: readonly WebSearchMode[] = [
	"auto",
	"provider_native",
	"godex_managed",
	"disabled",
];

const WEB_SEARCH_PROVIDERS: readonly WebSearchProvider[] = [
	"none",
	"mock",
	"zhipu",
];

const WEB_SEARCH_UNAVAILABLE_POLICIES: readonly WebSearchOnUnavailable[] = [
	"client_tool_call",
	"fail",
	"ignore",
];

export function parseWebSearchConfig(raw: unknown): WebSearchConfig {
	const input = asConfigObject(raw);
	return {
		enabled: booleanValue(
			input.enabled,
			DEFAULT_WEB_SEARCH_CONFIG.enabled,
			"web_search.enabled",
		),
		mode: enumValue(
			input.mode,
			WEB_SEARCH_MODES,
			DEFAULT_WEB_SEARCH_CONFIG.mode,
			"web_search.mode",
		),
		provider: enumValue(
			input.provider,
			WEB_SEARCH_PROVIDERS,
			DEFAULT_WEB_SEARCH_CONFIG.provider,
			"web_search.provider",
		),
		on_unavailable: enumValue(
			input.on_unavailable,
			WEB_SEARCH_UNAVAILABLE_POLICIES,
			DEFAULT_WEB_SEARCH_CONFIG.on_unavailable,
			"web_search.on_unavailable",
		),
		max_iterations:
			input.max_iterations !== undefined
				? positiveInteger(input.max_iterations, "web_search.max_iterations")
				: DEFAULT_WEB_SEARCH_CONFIG.max_iterations,
		timeout_ms:
			input.timeout_ms !== undefined
				? positiveInteger(input.timeout_ms, "web_search.timeout_ms")
				: DEFAULT_WEB_SEARCH_CONFIG.timeout_ms,
	};
}

function booleanValue(
	value: unknown,
	fallback: boolean,
	field: string,
): boolean {
	if (value === undefined) return fallback;
	if (typeof value === "boolean") return value;
	throw new Error(`${field} must be a boolean`);
}

function enumValue<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
	field: string,
): T {
	if (value === undefined) return fallback;
	if (typeof value === "string" && allowed.includes(value as T)) {
		return value as T;
	}
	throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
}
