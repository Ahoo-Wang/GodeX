import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import {
	mapProviderDeltasToEvents,
	ResponseStreamPhase,
	ResponseStreamStateMachine,
} from "../../bridge/stream";
import { ToolIdentityMap, type ToolPlan } from "../../bridge/tools";
import { WEB_SEARCH_FUNCTION_NAME } from "../../bridge/tools/web-search";
import { DEFAULT_WEB_SEARCH_CONFIG } from "../../config/sections/web-search";
import type { ResponsesContext } from "../../context/responses-context";
import { BRIDGE_REQUEST_UNSUPPORTED_TOOL, BridgeError } from "../../error";
import type {
	FunctionCall,
	ResponseItem,
	ResponseStreamEvent,
	WebSearchCall,
	WebSearchCallActionSearch,
} from "../../protocol/openai/responses";
import type { SearchResponse } from "../../search";
import { recordTraceEvent } from "../../trace";
import type {
	ProviderExchangeStreamOptions,
	ProviderStreamExchangeResult,
} from "../provider-exchange";
import { responseRequestEchoFields } from "../response-request-echo";
import {
	ATTR_UPSTREAM_LATENCY_MILLIS,
	pipeTransform,
} from "../stream-transforms/stream-utils";
import { TraceTransformer } from "../stream-transforms/trace-transformer";
import {
	extractManagedWebSearchCalls,
	type ManagedWebSearchCall,
	webSearchCallItem,
} from "./calls";
import { buildContinuationRequest } from "./continuation";
import { executeSearchWithTimeout } from "./search-execution";

export interface HostedWebSearchStreamResult {
	readonly stream: ReadableStream<ResponseStreamEvent>;
	readonly machine: ResponseStreamStateMachine;
}

export interface HostedWebSearchStreamExchange {
	stream(
		ctx: ResponsesContext,
		options?: ProviderExchangeStreamOptions,
	): Promise<ProviderStreamExchangeResult>;
}

interface ManagedStreamCall extends ManagedWebSearchCall {
	readonly item: FunctionCall;
	readonly outputIndex: number;
}

interface ResponseStreamController {
	enqueue(event: ResponseStreamEvent): void;
}

export class HostedWebSearchStreamRunner {
	constructor(private readonly exchange: HostedWebSearchStreamExchange) {}

	async stream(ctx: ResponsesContext): Promise<HostedWebSearchStreamResult> {
		const machine = new ResponseStreamStateMachine({
			responseId: ctx.responseId,
			createdAt: ctx.createdAt,
			model: ctx.resolved.model,
			provider: ctx.provider.name,
			echo: responseRequestEchoFields(ctx),
		});
		const firstExchange = await this.exchange.stream(ctx, {
			request: ctx.request,
		});
		ctx.attributes.set(
			ATTR_UPSTREAM_LATENCY_MILLIS,
			firstExchange.upstreamLatencyMillis,
		);
		const stream = new ReadableStream<ResponseStreamEvent>({
			start: async (controller) => {
				try {
					await this.run(ctx, machine, controller, firstExchange);
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		});
		return { stream, machine };
	}

	private async run(
		ctx: ResponsesContext,
		machine: ResponseStreamStateMachine,
		controller: ResponseStreamController,
		firstExchange: ProviderStreamExchangeResult,
	): Promise<void> {
		let request = ctx.request;
		let pendingExchange: ProviderStreamExchangeResult | null = firstExchange;
		const config = ctx.app.config.web_search ?? DEFAULT_WEB_SEARCH_CONFIG;

		for (let iteration = 0; iteration <= config.max_iterations; iteration++) {
			const { providerStream, built } =
				pendingExchange ?? (await this.exchange.stream(ctx, { request }));
			pendingExchange = null;

			const toolIdentities = new ToolIdentityMap();
			toolIdentities.addDeclarations(built.tools.declarations);
			machine.replaceToolIdentities(toolIdentities);

			const managed = await consumeProviderStream({
				ctx,
				providerStream,
				machine,
				controller,
				tools: built.tools,
			});
			if (!managed) return;
			if (iteration >= config.max_iterations) {
				throw new BridgeError(
					BRIDGE_REQUEST_UNSUPPORTED_TOOL,
					"web_search max_iterations exceeded.",
					{
						provider: ctx.resolved.provider,
						model: ctx.resolved.model,
						parameter: "web_search.max_iterations",
					},
				);
			}

			recordTraceEvent(ctx, "web_search.request", managed.search);
			// Emit in_progress + searching BEFORE the await so the client observes
			// search progress while it runs, not as a burst after it completes.
			const lifecycle = beginWebSearchLifecycle({
				controller,
				machine,
				item: webSearchCallItem({
					responseId: ctx.responseId,
					index: machine.snapshot.output.length,
					query: managed.query,
					queries: managed.queries,
					sources: [],
					status: "in_progress",
				}),
			});
			let search: SearchResponse;
			try {
				search = await executeSearchWithTimeout(
					managed.search,
					config.timeout_ms,
					(signal) => ctx.app.search.search(managed.search, signal),
				);
			} catch (error) {
				// Surface a failed web_search_call rather than letting the whole
				// stream die without a terminal item.
				lifecycle.fail();
				throw error;
			}
			recordTraceEvent(ctx, "web_search.response", search);
			lifecycle.complete({
				sources: search.results.map((result) => ({ url: result.url })),
			});
			request = buildContinuationRequest({
				original: request,
				previousItems: [{ ...managed.item, status: "completed" }],
				callId: managed.providerCall.callId,
				search,
			});
		}

		throw new BridgeError(
			BRIDGE_REQUEST_UNSUPPORTED_TOOL,
			"web_search loop terminated unexpectedly.",
			{
				provider: ctx.resolved.provider,
				model: ctx.resolved.model,
				parameter: "web_search",
			},
		);
	}
}

async function consumeProviderStream(input: {
	readonly ctx: ResponsesContext;
	readonly providerStream: ReadableStream<JsonServerSentEvent<unknown>>;
	readonly machine: ResponseStreamStateMachine;
	readonly controller: ResponseStreamController;
	readonly tools: ToolPlan;
}): Promise<ManagedStreamCall | null> {
	const tracedStream = pipeTransform(
		input.providerStream,
		new TraceTransformer("upstream.stream.event.raw", input.ctx),
	);
	const reader = tracedStream.getReader();
	let suppressed: {
		readonly itemId?: string;
		readonly outputIndex?: number;
	} | null = null;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const deltas = input.ctx.provider.spec.stream.deltas(value.data);
			for (const event of mapProviderDeltasToEvents({
				machine: input.machine,
				deltas,
				deferTerminal: true,
			})) {
				if (isManagedWebSearchAdded(event, input.tools)) {
					suppressed = {
						itemId: responseItemId(event.item),
						outputIndex: event.output_index,
					};
					continue;
				}
				if (suppressed && isSuppressedFunctionCallEvent(event, suppressed)) {
					continue;
				}
				input.controller.enqueue(event);
			}
		}

		const managed = managedSearchFromSnapshot(
			input.machine.snapshot.output,
			input.tools,
		);
		if (managed) {
			input.machine.removeOutputItem(managed.outputIndex);
			input.machine.clearDeferredFinish();
			return managed;
		}

		if (input.machine.phase !== ResponseStreamPhase.IN_PROGRESS) return null;
		for (const event of input.machine.finish(
			input.machine.deferredFinishReason,
		)) {
			input.controller.enqueue(event);
		}
		return null;
	} finally {
		reader.releaseLock();
	}
}

function managedSearchFromSnapshot(
	output: readonly ResponseItem[],
	tools: ToolPlan,
): ManagedStreamCall | null {
	for (let outputIndex = output.length - 1; outputIndex >= 0; outputIndex--) {
		const item = output[outputIndex];
		if (item?.type !== "function_call") continue;
		const [call] = extractManagedWebSearchCalls({ output: [item], tools });
		if (call) {
			return {
				...call,
				item,
				outputIndex,
			};
		}
	}
	return null;
}

function isManagedWebSearchAdded(
	event: ResponseStreamEvent,
	tools: ToolPlan,
): boolean {
	return (
		event.type === "response.output_item.added" &&
		event.item?.type === "function_call" &&
		event.item.name === WEB_SEARCH_FUNCTION_NAME &&
		tools.declarations.some(
			(declaration) =>
				declaration.execution === "godex_managed" &&
				declaration.providerType === "function",
		)
	);
}

function isSuppressedFunctionCallEvent(
	event: ResponseStreamEvent,
	suppressed: { readonly itemId?: string; readonly outputIndex?: number },
): boolean {
	return (
		event.item_id === suppressed.itemId ||
		event.output_index === suppressed.outputIndex
	);
}

interface WebSearchLifecycle {
	readonly outputIndex: number;
	complete(update: {
		readonly sources: readonly { readonly url: string }[];
	}): void;
	fail(): void;
}

function beginWebSearchLifecycle(input: {
	readonly controller: ResponseStreamController;
	readonly machine: ResponseStreamStateMachine;
	readonly item: WebSearchCall;
}): WebSearchLifecycle {
	const outputIndex = input.machine.appendOutputItem(input.item);
	input.controller.enqueue({
		type: "response.output_item.added",
		output_index: outputIndex,
		item: input.item,
	});
	input.controller.enqueue({
		type: "response.web_search_call.in_progress",
		output_index: outputIndex,
		item_id: input.item.id,
		item: input.item,
	});

	const searching: WebSearchCall = { ...input.item, status: "searching" };
	input.machine.updateOutputItem(outputIndex, searching);
	input.controller.enqueue({
		type: "response.web_search_call.searching",
		output_index: outputIndex,
		item_id: input.item.id,
		item: searching,
	});

	const baseAction = searchAction(input.item.action);
	return {
		outputIndex,
		complete(update) {
			const completed: WebSearchCall = {
				...input.item,
				status: "completed",
				action: {
					...baseAction,
					sources: update.sources.map((source) => ({
						type: "url" as const,
						url: source.url,
					})),
				},
			};
			input.machine.updateOutputItem(outputIndex, completed);
			input.controller.enqueue({
				type: "response.web_search_call.completed",
				output_index: outputIndex,
				item_id: input.item.id,
				item: completed,
			});
			input.controller.enqueue({
				type: "response.output_item.done",
				output_index: outputIndex,
				item: completed,
			});
		},
		fail() {
			const failed: WebSearchCall = { ...input.item, status: "failed" };
			input.machine.updateOutputItem(outputIndex, failed);
			input.controller.enqueue({
				type: "response.output_item.done",
				output_index: outputIndex,
				item: failed,
			});
		},
	};
}

function searchAction(
	action: WebSearchCall["action"],
): WebSearchCallActionSearch {
	return action.type === "search"
		? action
		: { type: "search", query: "", queries: [] };
}

function responseItemId(item: ResponseItem | undefined): string | undefined {
	return item && "id" in item && typeof item.id === "string"
		? item.id
		: undefined;
}
