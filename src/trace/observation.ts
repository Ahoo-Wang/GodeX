import type {
	PromptCacheObservation,
	PromptCacheObservationIndex,
} from "./types";

export class LruPromptCacheObservationIndex
	implements PromptCacheObservationIndex
{
	private readonly entries = new Map<string, PromptCacheObservation>();
	private readonly maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = Math.max(1, maxSize);
	}

	get(input: {
		provider: string;
		model: string;
		cache_identity_key?: string;
	}): PromptCacheObservation | null {
		if (!input.cache_identity_key) return null;
		const key = this.key(input.provider, input.model, input.cache_identity_key);
		const value = this.entries.get(key);
		if (!value) return null;
		this.entries.delete(key);
		this.entries.set(key, value);
		return value;
	}

	remember(observation: PromptCacheObservation): void {
		const key = this.key(
			observation.provider,
			observation.model,
			observation.cache_identity_key,
		);
		this.entries.delete(key);
		this.entries.set(key, observation);
		while (this.entries.size > this.maxSize) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) return;
			this.entries.delete(oldest);
		}
	}

	private key(
		provider: string,
		model: string,
		cacheIdentityKey: string,
	): string {
		const sep = String.fromCodePoint(0);
		return `${provider}${sep}${model}${sep}${cacheIdentityKey}`;
	}
}
