import type { ResponseItem } from "../../../protocol/openai/responses";
import type {
	FunctionCallDelta,
	ToolCallOutputItemMapper,
	ToolCallSnapshot,
} from "./stream-response-state";

export interface ToolCallRecord extends ToolCallSnapshot {
	outputIndex?: number;
	opened: boolean;
	done: boolean;
}

export class ToolCallOutputState {
	private readonly calls = new Map<number, ToolCallRecord>();

	constructor(private readonly mapper: ToolCallOutputItemMapper) {}

	apply(delta: FunctionCallDelta): ToolCallRecord {
		const index = delta.index ?? this.calls.size;
		const current =
			this.calls.get(index) ??
			({
				index,
				id: delta.id ?? `call_${index}`,
				name: "",
				arguments: "",
				opened: false,
				done: false,
			} satisfies ToolCallRecord);
		// Freeze id and name once the call is opened
		if (!current.opened) {
			if (delta.id) current.id = delta.id;
			if (delta.name) current.name = delta.name;
		}
		if (delta.arguments) current.arguments += delta.arguments;
		this.calls.set(index, current);
		return current;
	}

	get(index: number): ToolCallRecord | undefined {
		return this.calls.get(index);
	}

	get size(): number {
		return this.calls.size;
	}

	snapshot(call: ToolCallRecord): ToolCallSnapshot {
		return {
			index: call.index,
			id: call.id,
			name: call.name,
			arguments: call.arguments,
		};
	}

	item(call: ToolCallSnapshot): ResponseItem {
		return this.mapper(call);
	}

	openCalls(): ToolCallRecord[] {
		return Array.from(this.calls.values())
			.filter((c) => c.opened && !c.done)
			.sort((a, b) => (a.outputIndex ?? 0) - (b.outputIndex ?? 0));
	}
}
