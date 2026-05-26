import { describe, expect, test } from "bun:test";
import { LruPromptCacheObservationIndex } from "./observation";

describe("LruPromptCacheObservationIndex", () => {
	test("remembers observations by provider model and cache identity key", () => {
		const index = new LruPromptCacheObservationIndex(2);
		index.remember({
			provider: "openai",
			model: "gpt-test",
			cache_identity_key: "key-1",
			prefix_hash: "hash-1",
			prefix_bytes: 12,
			created_at: 1,
			request_id: "req_1",
		});
		expect(
			index.get({
				provider: "openai",
				model: "gpt-test",
				cache_identity_key: "key-1",
			}),
		).toMatchObject({ prefix_hash: "hash-1" });
	});

	test("evicts oldest observations when max size is reached", () => {
		const index = new LruPromptCacheObservationIndex(1);
		index.remember({
			provider: "openai",
			model: "gpt-test",
			cache_identity_key: "key-1",
			prefix_hash: "hash-1",
			prefix_bytes: 12,
			created_at: 1,
			request_id: "req_1",
		});
		index.remember({
			provider: "openai",
			model: "gpt-test",
			cache_identity_key: "key-2",
			prefix_hash: "hash-2",
			prefix_bytes: 12,
			created_at: 2,
			request_id: "req_2",
		});
		expect(
			index.get({
				provider: "openai",
				model: "gpt-test",
				cache_identity_key: "key-1",
			}),
		).toBeNull();
	});
});
