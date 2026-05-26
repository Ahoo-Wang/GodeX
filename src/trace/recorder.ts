import { summarizePayload } from "./payload";
import type { TraceStoreRow } from "./sqlite";
import type { TracePayloadOptions, TraceRecordEvent } from "./types";

export interface TraceRecorder {
    record(event: TraceRecordEvent): void;
    close?(): void | Promise<void>;
}

export interface TraceRecorderLogger {
    warn(event: string, attr?: Record<string, unknown> | (() => Record<string, unknown>)): void;
}

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
            if (this.queue.length >= this.options.batchSize) void this.flush();
        } catch (err) {
            this.warn("trace.record.error", { error: String(err) });
        }
    }

    async close(): Promise<void> {
        clearInterval(this.timer);
        await this.flush();
        try {
            this.options.store.close?.();
        } catch (err) {
            this.warn("trace.close.error", { error: String(err) });
        }
    }

    private async flush(): Promise<void> {
        if (this.flushing || this.queue.length === 0) return;
        this.flushing = true;
        const batch = this.queue.splice(0, this.options.batchSize);
        try {
            const rows = batch
                .map((event) => this.toRow(event))
                .filter((row): row is TraceStoreRow => row !== null);
            await this.options.store.insertBatch(rows);
        } catch (err) {
            this.warn("trace.flush.error", { error: String(err) });
        } finally {
            this.flushing = false;
            if (this.queue.length > 0) void this.flush();
        }
    }

    private toRow(event: TraceRecordEvent): TraceStoreRow | null {
        try {
            if (event.kind === "request") {
                const payload = this.payload(event.payload?.payload);
                return {
                    table: "requests",
                    request_id: event.request_id,
                    response_id: event.response_id,
                    provider: event.provider,
                    model: event.model,
                    stream: event.stream,
                    created_at: event.created_at,
                    requested_prompt_cache_key: event.requested_prompt_cache_key ?? null,
                    requested_prompt_cache_retention: event.requested_prompt_cache_retention ?? null,
                    prompt_cache_key: event.prompt_cache_key ?? null,
                    prompt_cache_retention: event.prompt_cache_retention ?? null,
                    prefix_hash: event.cache_detection?.prefix_hash ?? null,
                    prefix_bytes: event.cache_detection?.prefix_bytes ?? null,
                    cache_risk_level: event.cache_detection?.risk_level ?? null,
                    cache_risk_reasons_json: event.cache_detection
                        ? JSON.stringify(event.cache_detection.reasons)
                        : null,
                    tool_fingerprint_json: event.cache_detection?.tool_fingerprint
                        ? JSON.stringify(event.cache_detection.tool_fingerprint)
                        : null,
                    passthrough_json: event.cache_detection
                        ? JSON.stringify(event.cache_detection.passthrough)
                        : null,
                    ...payload,
                };
            }
            if (event.kind === "usage") {
                return {
                    table: "usage",
                    request_id: event.request_id,
                    response_id: event.response_id,
                    provider: event.provider,
                    model: event.model,
                    created_at: event.created_at,
                    input_tokens: event.usage.input_tokens ?? null,
                    output_tokens: event.usage.output_tokens ?? null,
                    total_tokens: event.usage.total_tokens ?? null,
                    cached_tokens: event.usage.cached_tokens ?? null,
                    cache_hit_ratio: event.usage.cache_hit_ratio ?? null,
                    cache_creation_input_tokens: event.usage.cache_creation_input_tokens ?? null,
                    cache_read_input_tokens: event.usage.cache_read_input_tokens ?? null,
                    raw_usage_json: event.raw_usage === undefined ? null : JSON.stringify(event.raw_usage),
                };
            }
            const payload = this.payload(event.payload?.payload);
            return {
                table: "events",
                request_id: event.request_id,
                response_id: event.response_id,
                event_name: event.event_name,
                sequence: event.sequence ?? 0,
                created_at: event.created_at,
                ...payload,
            };
        } catch (err) {
            this.warn("trace.serialize.error", {
                request_id: event.request_id,
                error: String(err),
            });
            return null;
        }
    }

    private payload(payload: unknown) {
        if (payload === undefined) {
            return {
                payload_hash: null,
                payload_bytes: null,
                payload_json: null,
                payload_truncated: false,
            };
        }
        return summarizePayload(payload, {
            capturePayload: this.options.capturePayload,
            payloadMaxBytes: this.options.payloadMaxBytes,
        });
    }

    private warn(event: string, attr?: Record<string, unknown>): void {
        try {
            this.options.logger.warn(event, attr);
        } catch {
            return;
        }
    }
}
