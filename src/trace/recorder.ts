import { mapTraceRecordToRow, type TraceRowMapperLogger } from "./row-mapper";
import type { TraceStoreRow } from "./sqlite";
import type { TracePayloadOptions, TraceRecordEvent } from "./types";

export interface TraceRecorder {
	record(event: TraceRecordEvent): void;
	close?(): void | Promise<void>;
}

export type TraceRecorderLogger = TraceRowMapperLogger;

export interface TraceStoreWriter {
	insertBatch(rows: TraceStoreRow[]): Promise<void>;
	close?(): void;
}

export interface AsyncTraceRecorderOptions extends TracePayloadOptions {
	maxQueueSize: number;
	batchSize: number;
	flushIntervalMs: number;
	store: TraceStoreWriter;
	logger: TraceRecorderLogger;
}

export class NoopTraceRecorder implements TraceRecorder {
	record(_event: TraceRecordEvent): void {}
	close(): void {}
}

export class AsyncTraceRecorder implements TraceRecorder {
	private readonly queue: TraceRecordEvent[] = [];
	private readonly timer: ReturnType<typeof setInterval>;
	private flushing = false;
	private flushScheduled = false;
	private pendingFlush: Promise<void> = Promise.resolve();

	constructor(private readonly options: AsyncTraceRecorderOptions) {
		this.timer = setInterval(() => {
			void this.flush();
		}, options.flushIntervalMs);
	}

	record(event: TraceRecordEvent): void {
		try {
			if (this.queue.length >= this.options.maxQueueSize) {
				this.warn("trace.queue.full", { request_id: event.request_id });
				return;
			}
			this.queue.push(event);
			if (this.queue.length >= this.options.batchSize) {
				this.scheduleFlush();
			}
		} catch (err) {
			this.warn("trace.record.error", { error: String(err) });
		}
	}

	async close(): Promise<void> {
		clearInterval(this.timer);
		while (this.queue.length > 0 || this.flushing) {
			if (this.flushing) {
				await this.pendingFlush;
			} else {
				await this.flush();
			}
		}
		try {
			this.options.store.close?.();
		} catch (err) {
			this.warn("trace.close.error", { error: String(err) });
		}
	}

	private scheduleFlush(): void {
		if (this.flushScheduled) return;
		this.flushScheduled = true;
		setTimeout(() => {
			this.flushScheduled = false;
			void this.flush();
		}, 0);
	}

	private async flush(): Promise<void> {
		if (this.flushing || this.queue.length === 0) return;
		this.flushing = true;
		const batch = this.queue.splice(0, this.options.batchSize);
		this.pendingFlush = (async () => {
			try {
				const rows = batch
					.map((event) => mapTraceRecordToRow(event, this.options))
					.filter((row): row is TraceStoreRow => row !== null);
				await this.options.store.insertBatch(rows);
			} catch (err) {
				this.warn("trace.flush.error", { error: String(err) });
			} finally {
				this.flushing = false;
				if (this.queue.length > 0) void this.flush();
			}
		})();
		await this.pendingFlush;
	}

	private warn(event: string, attr?: Record<string, unknown>): void {
		try {
			this.options.logger.warn(event, attr);
		} catch {
			return;
		}
	}
}
