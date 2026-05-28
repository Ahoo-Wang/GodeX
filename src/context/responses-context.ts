import type { CompatibilityDiagnostic } from "../bridge/compatibility";
import type { ProviderEdge } from "../bridge/provider-spec";
import type { Logger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResolvedModel } from "../resolver";
import type { ResponseSessionSnapshot } from "../session";
import type { ApplicationContext } from "./application-context";
import { OutputContractSlot } from "./output-contract-slot";

export interface ResponsesContextInit {
	app: ApplicationContext;
	request: ResponseCreateRequest;
	session: ResponseSessionSnapshot | null;
	resolved: ResolvedModel;
	provider: ProviderEdge<unknown, unknown, unknown>;
	requestId: string;
	responseId: string;
	createdAt: number;
	logger: Logger;
}

export class ResponsesContext {
	readonly app: ApplicationContext;
	readonly request: ResponseCreateRequest;
	readonly session: ResponseSessionSnapshot | null;
	readonly resolved: ResolvedModel;
	readonly provider: ProviderEdge<unknown, unknown, unknown>;
	readonly requestId: string;
	readonly responseId: string;
	readonly createdAt: number;
	readonly logger: Logger;
	readonly diagnostics: CompatibilityDiagnostic[];
	readonly attributes: Map<string, unknown>;
	readonly outputContract: OutputContractSlot;

	constructor(init: ResponsesContextInit) {
		this.app = init.app;
		this.request = init.request;
		this.session = init.session;
		this.resolved = init.resolved;
		this.provider = init.provider;
		this.requestId = init.requestId;
		this.responseId = init.responseId;
		this.createdAt = init.createdAt;
		this.logger = init.logger;
		this.diagnostics = [];
		this.attributes = new Map();
		this.outputContract = new OutputContractSlot();
	}

	addDiagnostic(diagnostic: CompatibilityDiagnostic): void {
		this.diagnostics.push(diagnostic);
	}
}
