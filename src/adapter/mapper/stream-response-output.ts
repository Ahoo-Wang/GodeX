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
        this.records[index] = { ...this.records[index]!, item };
    }

    markDone(index: number, item: ResponseItem): void {
        this.records[index] = { index, item, done: true };
    }

    items(): ResponseItem[] {
        return this.records.map((record) => record.item);
    }
}
