import type {
	PromptCacheAnalysisInput,
	PromptCacheDetection,
	PromptCacheDetector,
	PromptCacheObservation,
} from "./types";

const DYNAMIC_PATTERNS = [
	/\breq_[A-Za-z0-9_-]{6,}\b/,
	/\bresp_[A-Za-z0-9_-]{6,}\b/,
	/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
	/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
	/\b1[0-9]{9}\b/,
	/当前时间|current time|Date\.now\(\)/i,
];

function riskRank(risk: PromptCacheDetection["risk_level"]): number {
	return { none: 0, low: 1, medium: 2, high: 3 }[risk];
}

function maxRisk(
	a: PromptCacheDetection["risk_level"],
	b: PromptCacheDetection["risk_level"],
): PromptCacheDetection["risk_level"] {
	return riskRank(a) >= riskRank(b) ? a : b;
}

function hasDynamicText(current: PromptCacheAnalysisInput): boolean {
	return current.dynamic_text_candidates.some((candidate) =>
		DYNAMIC_PATTERNS.some((pattern) => pattern.test(candidate.text)),
	);
}

function toolsChanged(
	current: PromptCacheAnalysisInput,
	previous?: PromptCacheObservation | null,
): boolean {
	const prev = previous?.tool_fingerprint;
	const curr = current.tool_fingerprint;
	if (!prev && !curr) return false;
	if (!prev || !curr) return true;
	return prev.hash !== curr.hash;
}

export class PrefixPromptCacheDetector implements PromptCacheDetector {
	detect(input: {
		current: PromptCacheAnalysisInput;
		previous?: PromptCacheObservation | null;
	}): PromptCacheDetection {
		const reasons: string[] = [];
		let risk: PromptCacheDetection["risk_level"] = "none";
		const current = input.current;
		if (
			input.previous &&
			input.previous.prefix_hash !== current.static_prefix_hash
		) {
			risk = "high";
			reasons.push("prompt_cache_key prefix changed");
		}
		if (input.previous && toolsChanged(current, input.previous)) {
			risk = maxRisk(risk, "medium");
			reasons.push("tool order or names changed for cache identity");
		}
		if (hasDynamicText(current)) {
			risk = maxRisk(risk, "medium");
			reasons.push("dynamic prompt prefix content detected");
		}
		const keyPass =
			!current.requested_prompt_cache_key ||
			current.prompt_cache_key === current.requested_prompt_cache_key;
		const retentionPass =
			!current.requested_prompt_cache_retention ||
			current.prompt_cache_retention ===
				current.requested_prompt_cache_retention;
		if (!keyPass) {
			risk = maxRisk(risk, "medium");
			reasons.push("prompt_cache_key was not preserved in provider request");
		}
		if (!retentionPass) {
			risk = maxRisk(risk, "medium");
			reasons.push(
				"prompt_cache_retention was not preserved in provider request",
			);
		}
		return {
			risk_level: risk,
			reasons,
			prefix_hash: current.static_prefix_hash,
			prefix_bytes: current.static_prefix_bytes,
			tool_fingerprint: current.tool_fingerprint,
			passthrough: {
				prompt_cache_key: keyPass,
				prompt_cache_retention: retentionPass,
				cache_control: current.has_cache_control === true,
			},
		};
	}
}
