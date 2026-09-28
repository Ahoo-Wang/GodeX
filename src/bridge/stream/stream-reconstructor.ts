import { BRIDGE_STREAM_INVALID_TRANSITION, BridgeError } from "../../error";
import type {
	ResponseInputTokensDetails,
	ResponseOutputTokensDetails,
	ResponseStreamEvent,
	ResponseUsage,
} from "../../protocol/openai/responses";
import { ResponseStreamPhase } from "./response-stream-state-machine";
import type {
	MapProviderDeltasToEventsInput,
	ProviderStreamDelta,
	ProviderStreamError,
	ProviderStreamFinishReason,
	ProviderStreamToolCallDelta,
} from "./stream-delta";

export function mapProviderDeltasToEvents(
	input: MapProviderDeltasToEventsInput,
): ResponseStreamEvent[] {
	const { machine, deltas } = input;
	const events: ResponseStreamEvent[] = [];

	for (const rawDelta of deltas) {
		if (
			machine.phase !== ResponseStreamPhase.IDLE &&
			machine.phase !== ResponseStreamPhase.IN_PROGRESS
		) {
			break;
		}
		const delta = validateDelta(rawDelta, machine);
		if (machine.phase === ResponseStreamPhase.IDLE) {
			events.push(...machine.start());
		}

		if (hasOwn(delta, "error")) {
			events.push(...machine.fail(delta.error as ProviderStreamError));
			break;
		}
		if (hasOwn(delta, "usage")) {
			events.push(...machine.usage(delta.usage as ResponseUsage));
		}
		if (hasOwn(delta, "reasoning")) {
			events.push(...machine.reasoning(delta.reasoning as string));
		}
		if (hasOwn(delta, "refusal")) {
			events.push(...machine.refusal(delta.refusal as string));
		}
		if (hasOwn(delta, "toolCall")) {
			events.push(
				...machine.toolCall(delta.toolCall as ProviderStreamToolCallDelta),
			);
		}
		if (hasOwn(delta, "text")) {
			events.push(...machine.text(delta.text as string));
		}
		if (hasOwn(delta, "finishReason")) {
			if (input.deferTerminal && machine.deferFinish) {
				events.push(...machine.deferFinish(delta.finishReason));
			} else {
				events.push(...machine.finish(delta.finishReason));
			}
			break;
		}
	}

	return events;
}

function validateDelta(
	rawDelta: unknown,
	machine: MapProviderDeltasToEventsInput["machine"],
): ProviderStreamDelta {
	if (!isObjectRecord(rawDelta)) {
		throw invalidDelta(
			machine,
			"delta",
			"Provider stream delta must be an object.",
		);
	}
	validateRecognizedFields(rawDelta, machine);

	validateOptionalString(rawDelta, machine, "text");
	validateOptionalString(rawDelta, machine, "refusal");
	validateOptionalString(rawDelta, machine, "reasoning");
	const toolCall = validateToolCall(rawDelta, machine);
	const usage = validateUsage(rawDelta, machine);
	const error = validateError(rawDelta, machine);
	const finishReason = validateFinishReason(rawDelta, machine);

	return {
		...(hasOwn(rawDelta, "text") ? { text: rawDelta.text as string } : {}),
		...(hasOwn(rawDelta, "refusal")
			? { refusal: rawDelta.refusal as string }
			: {}),
		...(hasOwn(rawDelta, "reasoning")
			? { reasoning: rawDelta.reasoning as string }
			: {}),
		...(hasOwn(rawDelta, "toolCall") ? { toolCall } : {}),
		...(hasOwn(rawDelta, "usage") ? { usage } : {}),
		...(hasOwn(rawDelta, "error") ? { error } : {}),
		...(hasOwn(rawDelta, "finishReason") ? { finishReason } : {}),
	};
}

function validateOptionalString(
	delta: Record<PropertyKey, unknown>,
	machine: MapProviderDeltasToEventsInput["machine"],
	field: "text" | "refusal" | "reasoning",
): void {
	if (!hasOwn(delta, field)) return;
	if (typeof delta[field] !== "string") {
		throw invalidDelta(
			machine,
			field,
			`Provider stream delta ${field} must be a string when present.`,
		);
	}
}

const RECOGNIZED_DELTA_FIELDS = new Set<PropertyKey>([
	"text",
	"reasoning",
	"refusal",
	"toolCall",
	"usage",
	"finishReason",
	"error",
]);

function validateRecognizedFields(
	delta: Record<PropertyKey, unknown>,
	machine: MapProviderDeltasToEventsInput["machine"],
): void {
	const fields = Reflect.ownKeys(delta);
	if (fields.length === 0) {
		throw invalidDelta(
			machine,
			"delta",
			"Provider stream delta must include at least one recognized field.",
		);
	}
	for (const field of fields) {
		if (!RECOGNIZED_DELTA_FIELDS.has(field)) {
			throw invalidDelta(
				machine,
				String(field),
				`Provider stream delta contains unknown field: ${String(field)}.`,
			);
		}
	}
}

function validateToolCall(
	delta: Record<PropertyKey, unknown>,
	machine: MapProviderDeltasToEventsInput["machine"],
): ProviderStreamToolCallDelta | undefined {
	if (!hasOwn(delta, "toolCall")) return undefined;
	const toolCall = delta.toolCall;
	if (!isObjectRecord(toolCall)) {
		throw invalidDelta(
			machine,
			"toolCall",
			"Provider stream delta toolCall must be an object when present.",
		);
	}
	const fields = Reflect.ownKeys(toolCall);
	if (fields.length === 0) {
		throw invalidDelta(
			machine,
			"toolCall",
			"Provider stream delta toolCall must include at least one field.",
		);
	}
	const sanitized: {
		index?: number;
		id?: string;
		type?: string;
		name?: string;
		arguments?: string;
	} = {};
	if (hasOwn(toolCall, "index")) {
		const index = toolCall.index;
		if (!Number.isInteger(index) || (index as number) < 0) {
			throw invalidDelta(
				machine,
				"toolCall.index",
				"Provider stream delta toolCall.index must be a non-negative integer when present.",
			);
		}
		sanitized.index = index as number;
	}
	for (const field of ["id", "type", "name", "arguments"] as const) {
		if (!hasOwn(toolCall, field)) continue;
		if (typeof toolCall[field] !== "string") {
			throw invalidDelta(
				machine,
				`toolCall.${field}`,
				`Provider stream delta toolCall.${field} must be a string when present.`,
			);
		}
		const value = toolCall[field] as string;
		if (field === "id") sanitized.id = value;
		if (field === "type") sanitized.type = value;
		if (field === "name") sanitized.name = value;
		if (field === "arguments") sanitized.arguments = value;
	}
	for (const field of fields) {
		if (
			field !== "index" &&
			field !== "id" &&
			field !== "type" &&
			field !== "name" &&
			field !== "arguments"
		) {
			throw invalidDelta(
				machine,
				`toolCall.${String(field)}`,
				`Provider stream delta toolCall contains unknown field: ${String(field)}.`,
			);
		}
	}
	return sanitized;
}

function validateUsage(
	delta: Record<PropertyKey, unknown>,
	machine: MapProviderDeltasToEventsInput["machine"],
): ResponseUsage | undefined {
	if (!hasOwn(delta, "usage")) return undefined;
	const usage = delta.usage;
	if (!isObjectRecord(usage)) {
		throw invalidDelta(
			machine,
			"usage",
			"Provider stream delta usage must be an object when present.",
		);
	}
	for (const field of [
		"input_tokens",
		"output_tokens",
		"total_tokens",
	] as const) {
		validateRequiredFiniteNumber(usage, machine, `usage.${field}`, field);
	}
	const sanitized: ResponseUsage = {
		input_tokens: usage.input_tokens as number,
		output_tokens: usage.output_tokens as number,
		total_tokens: usage.total_tokens as number,
	};
	if (hasOwn(usage, "input_tokens_details")) {
		sanitized.input_tokens_details = validateInputTokensDetails(
			usage.input_tokens_details,
			machine,
		);
	}
	if (hasOwn(usage, "output_tokens_details")) {
		sanitized.output_tokens_details = validateOutputTokensDetails(
			usage.output_tokens_details,
			machine,
		);
	}
	return sanitized;
}

function validateInputTokensDetails(
	value: unknown,
	machine: MapProviderDeltasToEventsInput["machine"],
): ResponseInputTokensDetails {
	if (!isObjectRecord(value)) {
		throw invalidDelta(
			machine,
			"usage.input_tokens_details",
			"Provider stream delta usage.input_tokens_details must be an object when present.",
		);
	}
	const details: ResponseInputTokensDetails = {};
	if (hasOwn(value, "cached_tokens")) {
		validateFiniteNumber(
			value.cached_tokens,
			machine,
			"usage.input_tokens_details.cached_tokens",
		);
		details.cached_tokens = value.cached_tokens;
	}
	return details;
}

function validateOutputTokensDetails(
	value: unknown,
	machine: MapProviderDeltasToEventsInput["machine"],
): ResponseOutputTokensDetails {
	if (!isObjectRecord(value)) {
		throw invalidDelta(
			machine,
			"usage.output_tokens_details",
			"Provider stream delta usage.output_tokens_details must be an object when present.",
		);
	}
	const details: ResponseOutputTokensDetails = {};
	if (hasOwn(value, "reasoning_tokens")) {
		validateFiniteNumber(
			value.reasoning_tokens,
			machine,
			"usage.output_tokens_details.reasoning_tokens",
		);
		details.reasoning_tokens = value.reasoning_tokens;
	}
	return details;
}

function validateRequiredFiniteNumber(
	value: Record<PropertyKey, unknown>,
	machine: MapProviderDeltasToEventsInput["machine"],
	parameter: string,
	field: PropertyKey,
): void {
	if (!hasOwn(value, field)) {
		throw invalidDelta(
			machine,
			parameter,
			`Provider stream delta ${parameter} is required when usage is present.`,
		);
	}
	validateFiniteNumber(value[field], machine, parameter);
}

function validateFiniteNumber(
	value: unknown,
	machine: MapProviderDeltasToEventsInput["machine"],
	parameter: string,
): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw invalidDelta(
			machine,
			parameter,
			`Provider stream delta ${parameter} must be a finite number.`,
		);
	}
}

function validateError(
	delta: Record<PropertyKey, unknown>,
	machine: MapProviderDeltasToEventsInput["machine"],
): ProviderStreamError | undefined {
	if (!hasOwn(delta, "error")) return undefined;
	const error = delta.error;
	if (!isObjectRecord(error)) {
		throw invalidDelta(
			machine,
			"error",
			"Provider stream delta error must be an object when present.",
		);
	}
	if (hasOwn(error, "code") && typeof error.code !== "string") {
		throw invalidDelta(
			machine,
			"error.code",
			"Provider stream delta error.code must be a string when present.",
		);
	}
	if (typeof error.message !== "string") {
		throw invalidDelta(
			machine,
			"error.message",
			"Provider stream delta error.message must be a string.",
		);
	}
	return {
		code: hasOwn(error, "code") ? (error.code as string) : "server_error",
		message: error.message,
	};
}

function validateFinishReason(
	delta: Record<PropertyKey, unknown>,
	machine: MapProviderDeltasToEventsInput["machine"],
): ProviderStreamFinishReason | null | undefined {
	if (!hasOwn(delta, "finishReason")) return undefined;
	const finishReason = delta.finishReason;
	if (
		finishReason !== null &&
		finishReason !== undefined &&
		typeof finishReason !== "string"
	) {
		throw invalidDelta(
			machine,
			"finishReason",
			"Provider stream delta finishReason must be a string, null, or undefined when present.",
		);
	}
	return finishReason;
}

function invalidDelta(
	machine: MapProviderDeltasToEventsInput["machine"],
	parameter: string,
	message: string,
): BridgeError {
	return new BridgeError(BRIDGE_STREAM_INVALID_TRANSITION, message, {
		provider: providerOf(machine),
		model: modelOf(machine),
		parameter,
	});
}

function hasOwn<T extends object, K extends PropertyKey>(
	object: T,
	key: K,
): object is T & Record<K, unknown> {
	return Object.hasOwn(object, key);
}

function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerOf(
	machine: MapProviderDeltasToEventsInput["machine"],
): string {
	return machine.provider ?? "unknown";
}

function modelOf(machine: MapProviderDeltasToEventsInput["machine"]): string {
	return machine.model ?? "unknown";
}
