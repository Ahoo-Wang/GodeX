import { describe, expect, test } from "bun:test";
import { createCompatibilityObservation } from "./compatibility-observation";

describe("createCompatibilityObservation", () => {
	test("captures response identity, provider target, and decisions", () => {
		const observation = createCompatibilityObservation({
			requestId: "req_123",
			responseId: "resp_123",
			provider: "acme",
			model: "acme-chat",
			decisions: [
				{
					path: "text.format",
					action: "degraded",
					reason: "json_schema is degraded to json_object for provider acme.",
					effectiveValue: { type: "json_object" },
				},
			],
			toolPlan: { tools: [] },
			outputContract: { type: "json_schema" },
			streamState: { status: "completed" },
		});

		expect(observation).toEqual({
			requestId: "req_123",
			responseId: "resp_123",
			provider: "acme",
			model: "acme-chat",
			decisions: [
				{
					path: "text.format",
					action: "degraded",
					reason: "json_schema is degraded to json_object for provider acme.",
					effectiveValue: { type: "json_object" },
				},
			],
			toolPlan: { tools: [] },
			outputContract: { type: "json_schema" },
			streamState: { status: "completed" },
		});
	});
});
