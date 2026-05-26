import type { ResponseItem } from "../../protocol/openai/responses";

export interface OutputRecord {
	index: number;
	item: ResponseItem;
	done: boolean;
}

export class OutputCollectionState {
	private readonly records: OutputRecord[] = [];

	add(item: ResponseItem): OutputRecord {
		const record: OutputRecord = {
			index: this.records.length,
			item,
			done: false,
		};
		this.records.push(record);
		return record;
	}

	update(index: number, item: ResponseItem): void {
		const record = this.records[index];
		if (!record) return;
		this.records[index] = { ...record, item };
	}

	markDone(index: number, item: ResponseItem): void {
		this.records[index] = { index, item, done: true };
	}

	items(): ResponseItem[] {
		return this.records.map((record) => record.item);
	}
}
