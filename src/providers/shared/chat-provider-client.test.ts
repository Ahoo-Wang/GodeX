import { describe, expect, test } from "bun:test";
import {
	PROVIDER_UPSTREAM_ERROR,
	PROVIDER_UPSTREAM_RATE_LIMIT,
	PROVIDER_UPSTREAM_SERVER_ERROR,
	PROVIDER_UPSTREAM_TIMEOUT,
	ProviderError,
} from "../../error";
import { ChatProviderClient } from "./chat-provider-client";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function withFetch<T>(
	fetchImpl: typeof fetch,
	run: () => Promise<T>,
): Promise<T> {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = fetchImpl;
	try {
		return await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

function createClient(): ChatProviderClient<
	Record<string, unknown>,
	Record<string, unknown>,
	Record<string, unknown>
> {
	return new ChatProviderClient({
		provider: "test-provider",
		baseURL: "https://example.test",
		apiKey: "test-key",
	});
}

describe("ChatProviderClient error handling", () => {
	test("classifies upstream HTTP statuses with provider error codes", async () => {
		const cases = [
			[408, PROVIDER_UPSTREAM_TIMEOUT],
			[429, PROVIDER_UPSTREAM_RATE_LIMIT],
			[500, PROVIDER_UPSTREAM_SERVER_ERROR],
			[400, PROVIDER_UPSTREAM_ERROR],
		] as const;

		for (const [status, code] of cases) {
			await withFetch(
				(async () =>
					jsonResponse(
						{ error: { message: "upstream failed" } },
						status,
					)) as unknown as typeof fetch,
				async () => {
					const client = createClient();

					await expect(client.request({ model: "test" })).rejects.toMatchObject(
						{
							code,
							context: expect.objectContaining({
								provider: "test-provider",
								upstreamStatus: status,
							}),
						},
					);
				},
			);
		}
	});

	test("wraps fetch-level failures as ProviderError", async () => {
		const cause = new Error("network unreachable");

		await withFetch(
			(async () => {
				throw cause;
			}) as unknown as typeof fetch,
			async () => {
				const client = createClient();

				try {
					await client.request({ model: "test" });
					expect.unreachable("Should have thrown");
				} catch (err) {
					expect(err).toBeInstanceOf(ProviderError);
					if (err instanceof ProviderError) {
						expect(err.code).toBe(PROVIDER_UPSTREAM_ERROR);
						expect(err.context).toMatchObject({
							provider: "test-provider",
							model: "unknown",
							upstreamStatus: 502,
						});
					}
				}
			},
		);
	});
});
